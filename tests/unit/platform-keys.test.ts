/**
 * Platform provider-key overrides — contract tests.
 *
 * Covers the founder-rotation mechanism (admin dashboard → env injection):
 *  - a DB override replaces the env value for its provider only
 *  - removing the override restores the BOOT env value (not the injected one)
 *  - unknown providers and undecryptable blobs are ignored (fail open)
 *  - a fetch failure (table missing) leaves env untouched
 *  - admin input validation rejects the real-world paste failure modes
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptToken } from "../../packages/shared/src/crypto";
import {
  applyPlatformKeyOverrides,
  validatePlatformKeyInput,
  bootEnvHasKey,
  __resetPlatformKeySnapshotForTests,
} from "../../packages/shared/src/platform-keys";

const TEST_KEY_HEX = randomBytes(32).toString("hex");

const ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "PERPLEXITY_API_KEY",
  "SERP_API_KEY",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = { OAUTH_TOKEN_KEY: process.env["OAUTH_TOKEN_KEY"] };
  for (const v of ENV_VARS) savedEnv[v] = process.env[v];
  process.env["OAUTH_TOKEN_KEY"] = TEST_KEY_HEX;
  __resetPlatformKeySnapshotForTests();
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (typeof v === "string") process.env[k] = v;
    else delete process.env[k];
  }
  __resetPlatformKeySnapshotForTests();
});

function row(provider: string, plaintext: string) {
  return { provider, key_encrypted: encryptToken(plaintext).encrypted };
}

describe("applyPlatformKeyOverrides", () => {
  it("applies a DB override to its provider's env var only", async () => {
    process.env["ANTHROPIC_API_KEY"] = "env-anthropic";
    process.env["OPENAI_API_KEY"] = "env-openai";
    __resetPlatformKeySnapshotForTests();

    const n = await applyPlatformKeyOverrides(async () => [row("anthropic", "sk-rotated-from-dashboard")]);

    expect(n).toBe(1);
    expect(process.env["ANTHROPIC_API_KEY"]).toBe("sk-rotated-from-dashboard");
    expect(process.env["OPENAI_API_KEY"]).toBe("env-openai");
  });

  it("restores the BOOT env value when the override disappears", async () => {
    process.env["GEMINI_API_KEY"] = "env-gemini-original";
    __resetPlatformKeySnapshotForTests();

    await applyPlatformKeyOverrides(async () => [row("gemini", "dashboard-gemini")]);
    expect(process.env["GEMINI_API_KEY"]).toBe("dashboard-gemini");

    // Override deleted → next refresh reverts to the ORIGINAL env value.
    const n = await applyPlatformKeyOverrides(async () => []);
    expect(n).toBe(0);
    expect(process.env["GEMINI_API_KEY"]).toBe("env-gemini-original");
  });

  it("deletes the env var on revert when boot env never had it", async () => {
    delete process.env["PERPLEXITY_API_KEY"];
    __resetPlatformKeySnapshotForTests();

    await applyPlatformKeyOverrides(async () => [row("perplexity", "dashboard-pplx-key")]);
    expect(process.env["PERPLEXITY_API_KEY"]).toBe("dashboard-pplx-key");

    await applyPlatformKeyOverrides(async () => []);
    expect(process.env["PERPLEXITY_API_KEY"]).toBeUndefined();
  });

  it("ignores unknown providers and undecryptable blobs (fail open)", async () => {
    process.env["SERP_API_KEY"] = "env-serp";
    __resetPlatformKeySnapshotForTests();

    const n = await applyPlatformKeyOverrides(async () => [
      { provider: "not-a-provider", key_encrypted: Buffer.from("junk") },
      { provider: "serp", key_encrypted: Buffer.from("too-short") },
    ]);

    expect(n).toBe(0);
    expect(process.env["SERP_API_KEY"]).toBe("env-serp");
  });

  it("tolerates ONLY undefined-table (42P01): env untouched, resolves 0", async () => {
    process.env["ANTHROPIC_API_KEY"] = "env-anthropic";
    __resetPlatformKeySnapshotForTests();

    const tableMissing = Object.assign(
      new Error('relation "platform_provider_key" does not exist'),
      { code: "42P01" }
    );
    const n = await applyPlatformKeyOverrides(async () => {
      throw tableMissing;
    });

    expect(n).toBe(0);
    expect(process.env["ANTHROPIC_API_KEY"]).toBe("env-anthropic");
  });

  it("PROPAGATES real DB errors (permissions/connectivity) instead of masking them", async () => {
    process.env["ANTHROPIC_API_KEY"] = "env-anthropic";
    __resetPlatformKeySnapshotForTests();

    const permissionDenied = Object.assign(new Error("permission denied"), { code: "42501" });
    await expect(
      applyPlatformKeyOverrides(async () => {
        throw permissionDenied;
      })
    ).rejects.toThrow("permission denied");
    // Env keys stay in effect either way.
    expect(process.env["ANTHROPIC_API_KEY"]).toBe("env-anthropic");
  });

  it("bootEnvHasKey reflects the deployment env, not the injected override", async () => {
    delete process.env["OPENAI_API_KEY"];
    __resetPlatformKeySnapshotForTests();

    await applyPlatformKeyOverrides(async () => [row("openai", "dashboard-openai-key")]);

    expect(process.env["OPENAI_API_KEY"]).toBe("dashboard-openai-key");
    expect(bootEnvHasKey("openai")).toBe(false);
  });
});

describe("validatePlatformKeyInput", () => {
  it("accepts a normal-looking key", () => {
    expect(validatePlatformKeyInput("anthropic", "sk-ant-api03-abcdefghijklmnop")).toBeNull();
  });

  it("rejects unknown providers", () => {
    expect(validatePlatformKeyInput("azure", "sk-1234567890123456789012")).toMatch(/unknown/);
  });

  it("rejects short, whitespace and stray-character keys (the LinkedIn '|' lesson)", () => {
    expect(validatePlatformKeyInput("openai", "short")).toMatch(/short/);
    expect(validatePlatformKeyInput("openai", "sk-1234567890 1234567890")).toMatch(/whitespace/);
    expect(validatePlatformKeyInput("openai", "sk-12345678901234567890|")).toMatch(/invalid character/);
  });
});

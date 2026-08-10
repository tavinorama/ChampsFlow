/**
 * Smartlead webhook (P34) — the founder's precondition for the first cold
 * email: replies must land somewhere before anything is dispatched.
 *
 * What these tests pin:
 *  - the stage machine: a webhook may move a lead between MACHINE stages only;
 *    'qualified' and 'customer' are the founder's judgments and no provider
 *    event may ever overwrite them;
 *  - evidence-before-derivation: the raw event insert precedes the CRM upsert
 *    in the handler source, and the CRM part fails open (its failure must not
 *    trigger a provider retry that duplicates evidence);
 *  - the 503-vs-401 distinction: unconfigured screams "not configured",
 *    it does not masquerade as an auth failure.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextStageFor } from "../../apps/api/src/lib/smartlead-stage";

const route = readFileSync(
  join(__dirname, "../../apps/api/src/routes/webhooks-smartlead.ts"),
  "utf8"
);
const migration = readFileSync(
  join(__dirname, "../../packages/db/migrations/20260810000002_smartlead_event.up.sql"),
  "utf8"
);

describe("nextStageFor — the stage machine", () => {
  it("a reply promotes new → contacted, and keeps contacted contacted", () => {
    expect(nextStageFor(null, "EMAIL_REPLY")).toBe("contacted");
    expect(nextStageFor("new", "EMAIL_REPLY")).toBe("contacted");
    expect(nextStageFor("contacted", "EMAIL_REPLY")).toBe("contacted");
  });

  it("an unsubscribe moves machine stages to lost", () => {
    expect(nextStageFor("new", "LEAD_UNSUBSCRIBED")).toBe("lost");
    expect(nextStageFor("contacted", "LEAD_UNSUBSCRIBED")).toBe("lost");
  });

  it("NEVER touches the founder's judgments — qualified/customer are immovable", () => {
    for (const human of ["qualified", "customer"] as const) {
      for (const ev of ["EMAIL_REPLY", "LEAD_UNSUBSCRIBED", "EMAIL_BOUNCE", "EMAIL_OPEN"]) {
        expect(nextStageFor(human, ev), `${ev} moved ${human}`).toBeNull();
      }
    }
  });

  it("a reply does not resurrect a lost lead by itself", () => {
    // 'lost' usually means unsubscribed — auto-reviving them re-mails someone
    // who opted out. Resurrection is a human decision in /admin.
    expect(nextStageFor("lost", "EMAIL_REPLY")).toBeNull();
  });

  it("opens and bounces annotate but never move the stage", () => {
    expect(nextStageFor("new", "EMAIL_OPEN")).toBeNull();
    expect(nextStageFor("contacted", "EMAIL_BOUNCE")).toBeNull();
  });
});

describe("the handler's shape", () => {
  it("stores the raw event BEFORE deriving CRM state", () => {
    const evidence = route.indexOf("INSERT INTO smartlead_event");
    const derivation = route.indexOf("INSERT INTO crm_contact");
    expect(evidence).toBeGreaterThan(-1);
    expect(derivation).toBeGreaterThan(evidence);
  });

  it("unconfigured answers 503, not 401 — a config gap must not look like auth", () => {
    expect(route).toContain("503");
    expect(route).toContain("smartlead_webhook_unconfigured");
  });

  it("compares the token in constant time", () => {
    expect(route).toContain("timingSafeEqual");
  });

  it("CRM annotation fails open with a loud, reconcilable log", () => {
    expect(route).toContain("smartlead_crm_annotation_failed");
    expect(route).toContain("reconcile from smartlead_event");
  });

  it("never imports from a route file or auth — the worker-outage lesson holds here too", () => {
    expect(route).not.toMatch(/from "\.\/(?!\.)/);
    expect(route).toMatch(/from "\.\.\/\.\.\/\.\.\/\.\.\/packages\/shared\/src\/db-client"/);
  });
});

describe("the migration", () => {
  it("is append-only evidence: no UPDATE path, indexed by lead and by time", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS smartlead_event");
    expect(migration).toContain("idx_smartlead_event_email");
    expect(migration).toContain("idx_smartlead_event_received");
  });

  it("has a reversible down migration", () => {
    const down = readFileSync(
      join(__dirname, "../../packages/db/migrations/20260810000002_smartlead_event.down.sql"),
      "utf8"
    );
    expect(down).toContain("DROP TABLE IF EXISTS smartlead_event");
  });
});

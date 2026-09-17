/**
 * smartlead-campaigns-v4.test.ts — the two cold campaigns of 17/09.
 *
 * The founder rejected the cold copy three times in one afternoon ("weak",
 * "no punch", "generic and salesy") and approved v4: personal, by trade and
 * city, opening with the question the prospect's OWN customer asks. The copy
 * lives in docs/departments/sales/campaigns-v4.json so a revision is a text
 * edit; these tests are what keeps a revision inside the house rules and keeps
 * an unpersonalizable lead out of the campaign.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(__dirname, "../..");
const SCRIPT = join(root, "scripts/smartlead/campaigns_v4.py");
const COPY = join(root, "docs/departments/sales/campaigns-v4.json");
const copy = JSON.parse(readFileSync(COPY, "utf8"));

function py(args: string[], input?: string, env: Record<string, string> = {}) {
  const r = spawnSync("python3", [SCRIPT, ...args], { encoding: "utf8", input, env: { ...process.env, ...env } });
  const line = r.stdout.split("\n").find((l) => l.startsWith("RESULTADO_OZVOR"));
  return { status: r.status, stdout: r.stdout, result: line ? JSON.parse(line.replace("RESULTADO_OZVOR", "")) : null };
}

describe("the approved copy obeys the house rules, for every trade", () => {
  it("validate passes on the committed file", () => {
    const r = py(["validate"]);
    expect(r.result).toMatchObject({ ok: true, erros: [] });
    expect(r.result.segmentos).toBeGreaterThanOrEqual(25);
  });

  it("only two campaigns, four touches each, A/B on touches 1 and 2 only", () => {
    expect(Object.keys(copy.campaigns).sort()).toEqual(["geo", "stack"]);
    for (const c of Object.values<any>(copy.campaigns)) {
      expect(c.steps.map((s: any) => s.variants.length)).toEqual([2, 2, 1, 1]);
      expect(c.steps.map((s: any) => s.delay_in_days)).toEqual([0, 3, 4, 7]); // days 0/3/7/14
    }
  });

  it("a link in e-mail 1 is refused, and nothing else runs on refused copy", () => {
    const dir = mkdtempSync(join(tmpdir(), "copy-v4-"));
    try {
      const bad = JSON.parse(JSON.stringify(copy));
      bad.campaigns.geo.steps[0].variants[0].body.push("See ozvor.com for details.");
      const file = join(dir, "bad.json");
      writeFileSync(file, JSON.stringify(bad));
      const v = py(["validate", "--copy", file]);
      expect(v.status).toBe(1);
      expect(v.result.erros.join(" ")).toContain("link or domain in e-mail 1");
      const c = py(["create", "--copy", file], undefined, { SL_KEY: "x" });
      expect(c.status).toBe(1);
      expect(c.result.motivo).toContain("viola as regras da casa");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a second question, an em dash or an unknown merge field is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), "copy-v4-"));
    try {
      const bad = JSON.parse(JSON.stringify(copy));
      bad.campaigns.stack.steps[0].variants[0].body.push("Are you there? — {{revenue}}");
      const file = join(dir, "bad.json");
      writeFileSync(file, JSON.stringify(bad));
      const errs = py(["validate", "--copy", file]).result.erros.join(" | ");
      expect(errs).toContain("questions of its own");
      expect(errs).toContain("em/en dash");
      expect(errs).toContain("unknown merge field");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("every article is right: 'an HVAC company', 'an electrician', 'a roofer'", () => {
    expect(copy.segments.hvac.a_trade).toBe("an HVAC company");
    expect(copy.segments.electrical.a_trade).toBe("an electrician");
    expect(copy.segments.roofing.a_trade).toBe("a roofer");
  });
});

describe("a lead that cannot be personalized is not loaded", () => {
  const leads = [
    { first_name: "Ana", company_name: "Shamrock Heating & Cooling", website: "shamrockheatingandcooling.com", location: "Tempe, Arizona, United States" },
    { first_name: "Bo", company_name: "Blue Lab Digital Agency", website: "bluelab.io", location: "Austin, TX" },
    { first_name: "", company_name: "X Roofing", website: "xroof.com", location: "Dallas, Texas" },
    { first_name: "Cy", company_name: "RE/MAX Gold", website: "remaxgold.com", location: "Reno, Nevada" },
    { first_name: "Di", company_name: "Peak Roofing", website: "peakroofing.com", location: "United States" },
    { first_name: "Ed", company_name: "Maple Law", website: "maplelaw.ca", location: "Toronto, Canada" },
    { first_name: "Fa", company_name: "Oak Plumbing", website: "facebook.com/oakplumbing", location: "Mesa, AZ" },
    { first_name: "Gil", company_name: "Summit Holdings", website: "summitholdings.com", location: "Denver, Colorado" },
    { first_name: "Hal", company_name: "Hal Roofing", website: "halroofing.com", location: "Tulsa, Oklahoma", is_unsubscribed: true },
  ];
  const r = spawnSync("python3", [SCRIPT, "personalize"], { encoding: "utf8", input: JSON.stringify(leads) });
  const res = JSON.parse(r.stdout);

  it("a trade + a city = the buyer's own question, routed to the right campaign", () => {
    expect(res[0]).toMatchObject({ ok: true, route: "geo", segment: "hvac" });
    expect(res[0].custom_fields.buyer_question).toBe("My AC just died. Who should I call in Tempe?");
    expect(res[0].custom_fields.a_trade).toBe("an HVAC company");
    expect(res[1]).toMatchObject({ ok: true, route: "stack", segment: "agency/saas" });
  });

  it("each refusal names its reason", () => {
    expect(res.slice(2).map((x: any) => x.reason)).toEqual([
      "sem_first_name", "franquia_nacional", "sem_cidade", "nao_us", "sem_site_proprio", "sem_segmento", "stop_ou_unsub",
    ]);
    expect(res.slice(2).every((x: any) => x.ok === false)).toBe(true);
  });
});

describe("the SmartLead payload", () => {
  const code = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(join(root, "scripts/smartlead"))})`,
    "import campaigns_v4 as m",
    "c = m.load_copy()",
    "print(json.dumps(m.build_sequences(c, 'geo', 'ai-geo-search-2026-09')))",
  ].join("\n");
  const seqs = JSON.parse(spawnSync("python3", ["-c", code], { encoding: "utf8" }).stdout);

  it("touches 1 and 2 carry two equal variants; 3 and 4 are single", () => {
    expect(seqs.map((s: any) => (s.seq_variants ? s.seq_variants.length : 1))).toEqual([2, 2, 1, 1]);
    expect(seqs[0].variant_distribution_type).toBe("MANUAL_EQUAL");
    expect(seqs[0].seq_variants.map((v: any) => v.variant_label)).toEqual(["A", "B"]);
    expect(seqs[0].seq_variants.map((v: any) => v.variant_distribution_percentage)).toEqual([50, 50]);
  });

  it("every e-mail ends with the signature and the literal opt-out; links carry ?from=<campaign>", () => {
    const bodies = seqs.flatMap((s: any) => (s.seq_variants ? s.seq_variants.map((v: any) => v.email_body) : [s.email_body]));
    for (const b of bodies) {
      expect(b.endsWith("%signature%<br><br>P.S. If you'd rather not hear from me, just reply STOP and I won't write again.")).toBe(true);
      expect(b).not.toContain("{{campaign}}");
    }
    expect(bodies.filter((b: string) => b.includes("https://ozvor.com/test?from=ai-geo-search-2026-09")).length).toBeGreaterThanOrEqual(4);
  });
});

describe("the workflow cannot send or start anything by accident", () => {
  const wf = readFileSync(join(root, ".github/workflows/smartlead-campaigns-v4.yml"), "utf8");
  const script = readFileSync(SCRIPT, "utf8");

  it("dry-run is the default and only the literal 'yes' confirms", () => {
    expect(wf).toMatch(/confirm:[\s\S]*?default: "no"/);
    expect(wf).toContain('[ "${CONFIRM}" = "yes" ] && args+=(--confirm)');
    expect(wf).toContain("campaigns_v4.py validate");
  });

  it("there is no start action, an active destination aborts the load, and only STARTED leads move", () => {
    expect(script).not.toMatch(/"status":\s*"(START|ACTIVE)"/);
    expect(script).toContain("adicionar lead a campanha ativa e ENVIAR e-mail. Abortado.");
    expect(script).toContain('if status != "STARTED"');
  });

  it("offline dry-run of create prints the plan and touches nothing", () => {
    const r = py(["create"], undefined, { SL_KEY: "x" });
    expect(r.status).toBe(0);
    expect(r.result.modo).toContain("ENSAIO");
    expect(r.result.plano.geo.variantes_por_toque).toEqual([2, 2, 1, 1]);
  });

  it("a rehearsal counts leads before the campaigns exist; a real run refuses; an active destination always aborts", () => {
    const code = [
      "import sys, json",
      `sys.path.insert(0, ${JSON.stringify(join(root, "scripts/smartlead"))})`,
      "import campaigns_v4 as m",
      "names = {'geo': 'g', 'stack': 's'}",
      "res = {",
      "  'rehearsal_missing': m.resolve_destinations({}, names, False),",
      "  'real_missing': m.resolve_destinations({}, names, True),",
      "  'drafted': m.resolve_destinations({'g': {'id': 1, 'status': 'DRAFTED'}, 's': {'id': 2, 'status': 'PAUSED'}}, names, True),",
      "  'active_rehearsal': m.resolve_destinations({'g': {'id': 1, 'status': 'ACTIVE'}, 's': {'id': 2, 'status': 'DRAFTED'}}, names, False),",
      "}",
      "print(json.dumps(res))",
    ].join("\n");
    const res = JSON.parse(spawnSync("python3", ["-c", code], { encoding: "utf8" }).stdout);
    expect(res.rehearsal_missing[2]).toBe("");
    expect(res.rehearsal_missing[1]).toHaveLength(2);
    expect(res.real_missing[2]).toContain("correr create primeiro");
    expect(res.drafted).toEqual([{ geo: 1, stack: 2 }, [], ""]);
    expect(res.active_rehearsal[2]).toContain("ENVIAR e-mail. Abortado.");
  });

  it("a sub-trade is not called a general contractor: it gets its own words or stays out", () => {
    const leads = [
      { first_name: "Al", company_name: "Bright Painting Contractors", website: "brightpainting.com", location: "Mesa, Arizona" },
      { first_name: "Bea", company_name: "Summit Construction", website: "summitconstruction.com", location: "Boise, Idaho" },
      { first_name: "Cal", company_name: "Apex Drywall Contractors", website: "apexdrywall.com", location: "Reno, Nevada" },
      { first_name: "Dee", company_name: "Valley Concrete & Paving", website: "valleyconcrete.com", location: "Fresno, California" },
      { first_name: "Eli", company_name: "Acme Construction Supply", website: "acmesupply.com", location: "Tulsa, Oklahoma" },
    ];
    const r = JSON.parse(spawnSync("python3", [SCRIPT, "personalize"], { encoding: "utf8", input: JSON.stringify(leads) }).stdout);
    expect(r[0]).toMatchObject({ ok: true, segment: "painting" });
    expect(r[0].custom_fields.buyer_question).toBe("Who is a good house painter in Mesa?");
    expect(r[1]).toMatchObject({ ok: true, segment: "construction" });
    expect(r[2]).toMatchObject({ ok: false, reason: "sem_segmento" });
    expect(r[3]).toMatchObject({ ok: true, segment: "concrete/paving" });
    expect(r[4]).toMatchObject({ ok: false, reason: "sem_segmento" });
  });

  it("SmartProspect: the search is free, the spend is capped, and a contact maps to a personalizable lead", () => {
    const code = [
      "import sys, json",
      `sys.path.insert(0, ${JSON.stringify(join(root, "scripts/smartlead"))})`,
      "import campaigns_v4 as m",
      "c = m.load_copy()",
      "biz = m.contact_to_lead({'firstName': 'Ana', 'lastName': 'X', 'email': 'ana@peakroofing.com', 'company': {'name': 'Peak Roofing'}, 'city': 'Tulsa', 'state': 'Oklahoma', 'country': 'United States'})",
      "free = m.contact_to_lead({'firstName': 'Bo', 'email': 'bo@gmail.com', 'company': {'name': 'Bo Plumbing'}, 'city': 'Mesa', 'state': 'AZ'})",
      "res = {",
      "  'biz': biz, 'biz_fields': m.personalize(c, biz)[0]['custom_fields'],",
      "  'free_site': free['website'], 'free_reason': m.personalize(c, free)[1],",
      "  'payload': m.search_payload('roofing', 99999),",
      "  'trades_without_copy': [t for t in m.TRADE_SEARCH if t not in c['segments']],",
      "  'shape': m.shape_of({'email': 'a@b.com', 'company': {'name': 'N', 'deep': {'x': 1}}}),",
      "}",
      "print(json.dumps(res))",
    ].join("\n");
    const res = JSON.parse(spawnSync("python3", ["-c", code], { encoding: "utf8" }).stdout);
    expect(res.biz.website).toBe("peakroofing.com"); // the verified business domain is the site
    expect(res.biz.location).toBe("Tulsa, Oklahoma, United States");
    expect(res.biz_fields.buyer_question).toBe("My roof is leaking. Who is a good roofer in Tulsa?");
    expect(res.free_site).toBe(""); // a gmail address is nobody's website
    expect(res.free_reason).toBe("sem_site_proprio");
    expect(res.payload.limit).toBe(500);
    expect(res.payload.country).toEqual(["United States"]);
    expect(res.payload.dontDisplayOwnedContact).toBe(true);
    expect(res.trades_without_copy).toEqual([]);
    expect(JSON.stringify(res.shape)).not.toContain("a@b.com"); // key structure only, never a value

    const script = readFileSync(SCRIPT, "utf8");
    expect(script).toContain("NENHUM credito gasto");
    expect(script).toContain('"verification_status": "valid"');
    expect(script).toContain("limit tem de estar entre 1 e 500");
    const bad = py(["prospect", "--trade", "unicorns"], undefined, { SL_KEY: "x" });
    expect(bad.status).toBe(1);
    const over = py(["prospect", "--trade", "roofing", "--limit", "5000"], undefined, { SL_KEY: "x" });
    expect(over.status).toBe(1);
    const wf = readFileSync(join(root, ".github/workflows/smartlead-campaigns-v4.yml"), "utf8");
    expect(wf).toContain("create|load|prospect");
  });

  it("a 2xx answer with a non-JSON body is a success, not a failure (the DELETE of the first live load)", () => {
    const script = readFileSync(SCRIPT, "utf8");
    expect(script).toContain('parsed = {"_raw": body[:120]}');
    const code = [
      "import sys, json",
      `sys.path.insert(0, ${JSON.stringify(join(root, "scripts/smartlead"))})`,
      "import campaigns_v4 as m",
      "print(json.dumps([m.bad(200, {'_raw': 'ok'}), m.bad(204, {}), m.bad(0, {'_error': 'URLError'}), m.bad(404, {'_http_error': 404})]))",
    ].join("\n");
    expect(JSON.parse(spawnSync("python3", ["-c", code], { encoding: "utf8" }).stdout)).toEqual([false, false, true, true]);
  });
});

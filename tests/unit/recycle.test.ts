/**
 * Unit — the 2-month non-responder recycling loop (apps/api/src/lib/recycle +
 * the worker job's shape).
 *
 * What these tests pin (founder directive 01/09):
 *  - the 60-day boundary is exact: touched 59 days ago = out, 61 days = in;
 *  - 'lost' (unsubscribed) is NEVER recycled — out forever; the founder's
 *    judgments ('qualified'/'customer') are equally untouchable;
 *  - anyone who ever replied is excluded;
 *  - the "[recycle] proposto <date> campanha <slug>" marker restarts the
 *    clock — a lead proposed within the window is never proposed twice;
 *  - the batch cap holds, coldest leads first;
 *  - Telegram gets masked samples only (no raw addresses);
 *  - the worker writes the marker BEFORE notifying, and the machine sends
 *    nothing (source-pinned, same style as the smartlead webhook tests).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RECYCLE_BATCH_CAP,
  RECYCLE_WINDOW_DAYS,
  buildRecycleSlug,
  groupRecycleBatches,
  latestRecycleMarkerDate,
  maskEmail,
  recycleMarkerLine,
  selectRecycleCandidates,
  type RecycleCandidateRow,
} from "../../apps/api/src/lib/recycle";

const NOW = new Date("2026-09-01T08:00:00.000Z");
const daysAgo = (n: number): string =>
  new Date(NOW.getTime() - n * 24 * 3600 * 1000).toISOString();

function row(partial: Partial<RecycleCandidateRow>): RecycleCandidateRow {
  return {
    email: "lead@acme.com",
    stage: "contacted",
    note: null,
    last_event_at: daysAgo(90),
    reply_count: 0,
    ...partial,
  };
}

describe("the 60-day boundary", () => {
  it("61 days cold: in; 59 days: out; exactly 60: out (strictly older wins)", () => {
    expect(selectRecycleCandidates([row({ last_event_at: daysAgo(61) })], NOW)).toHaveLength(1);
    expect(selectRecycleCandidates([row({ last_event_at: daysAgo(59) })], NOW)).toHaveLength(0);
    expect(selectRecycleCandidates([row({ last_event_at: daysAgo(60) })], NOW)).toHaveLength(0);
  });

  it("an unparsable last_event_at excludes the row instead of throwing", () => {
    expect(selectRecycleCandidates([row({ last_event_at: "garbage" })], NOW)).toHaveLength(0);
  });
});

describe("who is NEVER recycled", () => {
  it("'lost' (unsubscribed) is out forever", () => {
    expect(selectRecycleCandidates([row({ stage: "lost" })], NOW)).toHaveLength(0);
  });

  it("the founder's judgments — qualified/customer — are untouchable", () => {
    for (const stage of ["qualified", "customer"]) {
      expect(selectRecycleCandidates([row({ stage })], NOW), stage).toHaveLength(0);
    }
  });

  it("anyone who ever replied is out, even at stage 'contacted'", () => {
    expect(selectRecycleCandidates([row({ reply_count: 1 })], NOW)).toHaveLength(0);
    expect(selectRecycleCandidates([row({ reply_count: "2" })], NOW)).toHaveLength(0);
  });

  it("only 'new' and 'contacted' qualify", () => {
    expect(selectRecycleCandidates([row({ stage: "new" })], NOW)).toHaveLength(1);
    expect(selectRecycleCandidates([row({ stage: "contacted" })], NOW)).toHaveLength(1);
  });
});

describe("the recycle marker restarts the clock", () => {
  const slug = buildRecycleSlug(NOW);

  it("a marker within the window blocks re-proposal", () => {
    const recent = recycleMarkerLine(new Date(NOW.getTime() - 30 * 24 * 3600 * 1000), slug);
    expect(
      selectRecycleCandidates([row({ note: `some note\n${recent}` })], NOW)
    ).toHaveLength(0);
  });

  it("a marker OLDER than the window lets the lead cycle again — the practice repeats", () => {
    const old = recycleMarkerLine(new Date(NOW.getTime() - 70 * 24 * 3600 * 1000), "recycle-2026-06-23");
    expect(selectRecycleCandidates([row({ note: old })], NOW)).toHaveLength(1);
  });

  it("multiple markers: the LATEST one rules", () => {
    const note = [
      recycleMarkerLine(new Date("2026-04-01T00:00:00Z"), "recycle-2026-04-01"),
      recycleMarkerLine(new Date("2026-08-15T00:00:00Z"), "recycle-2026-08-15"),
    ].join("\n");
    expect(latestRecycleMarkerDate(note)?.toISOString().slice(0, 10)).toBe("2026-08-15");
    expect(selectRecycleCandidates([row({ note })], NOW)).toHaveLength(0);
  });

  it("marker parse survives surrounding note noise", () => {
    const note = `[smartlead] EMAIL_OPEN (campaign 2) 2026-05-02\nfounder: sem resposta\n${recycleMarkerLine(NOW, slug)}`;
    expect(latestRecycleMarkerDate(note)?.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("no marker → null", () => {
    expect(latestRecycleMarkerDate(null)).toBeNull();
    expect(latestRecycleMarkerDate("plain note")).toBeNull();
  });
});

describe("cap and ordering", () => {
  it("caps the batch and keeps the COLDEST leads (oldest last touch) first", () => {
    const rows = Array.from({ length: RECYCLE_BATCH_CAP + 50 }, (_, i) =>
      row({ email: `lead${i}@x.com`, last_event_at: daysAgo(61 + i) })
    );
    const out = selectRecycleCandidates(rows, NOW);
    expect(out).toHaveLength(RECYCLE_BATCH_CAP);
    // Coldest = largest daysAgo = the LAST generated rows.
    expect(out[0]).toBe(`lead${RECYCLE_BATCH_CAP + 49}@x.com`);
    expect(out).not.toContain("lead0@x.com");
  });
});

describe("maskEmail — samples never leak the address", () => {
  it("keeps first chars + TLD only", () => {
    expect(maskEmail("joao@acme.com")).toBe("j***@a***.com");
    expect(maskEmail("m@b.io")).toBe("m***@b***.io");
  });
  it("degrades to *** on garbage", () => {
    expect(maskEmail("no-at")).toBe("***");
  });
});

describe("groupRecycleBatches — the batch is rebuilt from the markers", () => {
  it("groups by slug, newest batch first, emails deduped and sorted", () => {
    const l1 = recycleMarkerLine(new Date("2026-09-01T00:00:00Z"), "recycle-2026-09-01");
    const l0 = recycleMarkerLine(new Date("2026-06-01T00:00:00Z"), "recycle-2026-06-01");
    const batches = groupRecycleBatches([
      { email: "b@x.com", note: `${l0}\n${l1}` },
      { email: "a@x.com", note: l1 },
      { email: "a@x.com", note: l1 }, // duplicate row must not duplicate the email
      { email: "c@x.com", note: "no markers here" },
    ]);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toMatchObject({ slug: "recycle-2026-09-01", proposedOn: "2026-09-01" });
    expect(batches[0].emails).toEqual(["a@x.com", "b@x.com"]);
    expect(batches[1].emails).toEqual(["b@x.com"]);
  });
});

describe("the worker job's shape (source-pinned)", () => {
  const job = readFileSync(
    join(__dirname, "../../apps/worker/src/jobs/recycle-scan.ts"),
    "utf8"
  );

  it("writes the marker BEFORE notifying — artifact before notification", () => {
    const marker = job.indexOf("UPDATE crm_contact");
    const notify = job.lastIndexOf("Baixe o CSV");
    expect(marker).toBeGreaterThan(-1);
    expect(notify).toBeGreaterThan(marker);
  });

  it("head-trims the note so the marker always survives the 4000 cap", () => {
    expect(job).toContain("3900");
  });

  it("excludes 'lost' and repliers in SQL too (belt and braces with the pure filter)", () => {
    expect(job).toContain("c.stage IN ('new', 'contacted')");
    expect(job).toContain("FILTER (WHERE e.event_type = 'EMAIL_REPLY') = 0");
  });

  it("says out loud that the machine never sends", () => {
    expect(job).toContain("A MÁQUINA NUNCA ENVIA");
  });

  it("samples in Telegram are masked", () => {
    expect(job).toContain("maskEmail");
  });

  it("the window and cap come from the shared constants", () => {
    expect(job).toContain("RECYCLE_WINDOW_DAYS");
    expect(job).toContain("RECYCLE_BATCH_CAP");
    expect(RECYCLE_WINDOW_DAYS).toBe(60);
  });
});

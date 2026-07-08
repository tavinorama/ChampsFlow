# Ozvor — Week-1 Sales CRM & First-Lead Workflow

> Owner: VP Sales · Created: 2026-07-08 · Status: ACTIVE (launch week)
> Closes #160. Companion to [first-week-playbook.md](first-week-playbook.md),
> [icp-website-audit.md](icp-website-audit.md), [battlecards.md](battlecards.md),
> [signal-shortlist.md](signal-shortlist.md).

## TL;DR

A **zero-cost CRM for launch week** so Sales stops running from a blank STATE.
The tracker is a repo-versioned CSV ([week1-crm.csv](week1-crm.csv)) you can open
in Sheets/Excel or import into Notion — one row per prospect, one status column
driving the pipeline. This doc defines the **columns**, the **pipeline stages**,
and the **first-50-lead workflow**. **No real outbound is sent until the founder
approves** the message template, sender identity, physical-address line, and
opt-out — the free-test-first motion is the only launch-week play, and every
prospect gets a real finding or no outreach. No fabricated leads, scores, or
metrics live in this repo.

---

## 1. The tool (no cost)

Pick one; all three read the same schema:

- **CSV in the repo** — [`week1-crm.csv`](week1-crm.csv) (header committed; rows
  are working data — keep the working copy in Sheets, not committed, so prospect
  PII isn't versioned). Fastest to start.
- **Google Sheet** — import `week1-crm.csv` as the header row. Best for filters +
  the founder sharing a live view.
- **Notion database** — create a DB with the columns below; `stage` as a Status
  property with the pipeline stages as options.

**Do not commit real prospect PII** (names, emails) to git — the repo holds the
*template + schema*, the live rows live in the chosen tool. `lead_capture` /
`kit_order` in the product DB remain the system of record for anyone who actually
runs a test or buys.

## 2. Columns (schema)

| Column | Meaning |
|---|---|
| `company` | Prospect company name |
| `website` | Domain (also what we audit) |
| `icp_segment` | `agency` (Agency $249) or `smb` (Growth $99) — see playbook §1 |
| `lead_source` | Where they came from (Reddit thread, LinkedIn, referral, inbound free-test, community) |
| `contact_name` | Point of contact |
| `contact_role` | Title / authority level |
| `authority` | `decision-maker` / `influencer` / `unknown` |
| `prompt_tested` | The real buyer prompt we ran in the free test |
| `competitor_surfaced` | Who AI named instead of them (the hook) |
| `score_or_finding` | Their real Ozvor AI Visibility Score / the one factual finding |
| `stage` | Pipeline stage (§3) |
| `next_action` | The single next step + date |
| `owner` | Who owns the next action (founder / Hermes) |
| `est_value_usd_mo` | Plan value if won ($99 / $249 / Sprint / OrganicPosts) |
| `last_touch` | Date of last contact |
| `notes` | Objections, context, timing |

## 3. Pipeline stages

`Lead → Tested → MQL → SQL → Call Booked → Proposal → Won / Lost / Nurture`

| Stage | Definition | Exit criteria |
|---|---|---|
| **Lead** | Identified, fits ICP, not yet audited | We run a real free test |
| **Tested** | Free test run; we have a real finding | Finding shared / they engage |
| **MQL** | Engaged with the finding (opened, replied, ran their own test) | Shows buying context |
| **SQL** | Confirmed need + authority + fit | Agrees to a call or self-serve trial |
| **Call Booked** | Discovery/demo scheduled | Call happens |
| **Proposal** | Kit/Growth/Agency/Sprint/OrganicPosts offer made | Decision |
| **Won** | Paid (Kit, plan, or Sprint) | — |
| **Lost** | No for now (log reason in `notes`) | — |
| **Nurture** | Not now, revisit later (30-day re-test hook) | Re-enters as Lead |

Keep the [sales STATE](STATE.md) *Pipeline summary* table in sync (counts per
stage) — that is what the CEO/founder reads.

## 4. First-50-lead workflow

**Motion: free-test-first, not "buy my SaaS."** Every prospect gets one real,
factual finding — or no outreach at all.

1. **Source 50 (no spend).** Draw from the existing assets: agency/SMB targets in
   [icp-website-audit.md](icp-website-audit.md) and the ToS-safe communities in
   [signal-shortlist.md](signal-shortlist.md). Add company + website + segment as
   `Lead` rows.
2. **Qualify to ICP.** Drop anyone who isn't Segment A (agency) or B (SMB) per
   the playbook. Set `authority` where known.
3. **Run a real free test** on each (`/test`, or the same audit engine). Record
   the real `prompt_tested`, `competitor_surfaced`, `score_or_finding`. → `Tested`.
   *If a test can't produce a real finding, the prospect is not contacted.*
4. **Prepare the finding** — one true sentence (e.g. "ChatGPT names <competitor>,
   not <company>, for '<prompt>'"). Never invent a number or a ranking.
5. **⛔ Outreach gate (founder-approved before ANY send):** message template,
   sender identity/domain, **physical mailing address line**, and **opt-out**
   mechanism. Until approved, drafts stay in the tracker/`notes` — nothing sends.
   (See playbook + AGENTS.md: outbound is founder-gated.)
6. **On approval, send + track.** Log `last_touch`, advance `stage`, set the next
   `next_action`. Inbound free-testers who leave an email enter as `Tested`
   automatically (they're already in `lead_capture`).
7. **Review daily** in the launch cadence: new leads, stage moves, blockers →
   feed the founder digest.

## 5. Guardrails (non-negotiable)

- No cold outbound before the founder approves template + sender + address + opt-out.
- No fabricated leads, scores, findings, or testimonials — audits are real or the
  prospect isn't contacted.
- No mass/automated posting in communities; manual, genuine participation only.
- Prospect PII stays in the CRM tool, not in git.

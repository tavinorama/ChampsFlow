# Data Provenance & Collection Policy — Ozvor

**TL;DR** (≤200 words): Every external signal Ozvor collects is registered in
the `source_registry` table with its ToS identity, legal basis (GDPR Art. 6 /
LGPD Art. 7 / FTC §5 fairness), and retention period; per-probe evidence rows
carry a `source_id` FK to it. Red lines, all enforced in code today and
CI-checked: (1) we never touch the Reddit Data API — Reddit signals come from
public SERP results only, and the Data API path stays gated behind a Reddit
commercial licence AND the GEO-A1 FTC disclosure; (2) we only ever query the
client's OWN brand (GEO-A2), never a competitor's; (3) we store aggregates
from social sources — counts, subreddit names, derived sentiment — never
usernames, comment bodies, or raw snippets; (4) every probe query is scrubbed
of emails, phone numbers, and @handles at the provider gateway before leaving
our boundary; (5) collected query text is purged after 90 days (existing
pg_cron), hashes retained. Business contact data in Ozvor Pages is intentional
first-party content under contract, not scrubbed — that distinction is this
policy's §4. This registry feeds the ROPA (#142) and DPA documentation (#143)
and is exportable as a customer-facing audit artifact.

---

## 1. Why this document exists

The enterprise and agency deals Ozvor wants die at one desk: the customer's
DPO or legal gatekeeper asking "where does your data come from, under which
terms, and how long do you keep it?". Until 2026-08-06 our honest answers
lived in code comments — true, but invisible and unverifiable. This policy,
the `source_registry` table, and the CI checks that pin them together turn
"we behave well" into "we can show it". Jurisdictions covered: **Brazil
(LGPD)** — home jurisdiction; **EU (GDPR)**; **US (CCPA/CPRA, FTC §5)**.

## 2. The source matrix

Authoritative copy: table `source_registry` (migration
`20260806000001_source_provenance`). Summary as of 2026-08-06:

| id | What | Legal basis | Raw retention |
|---|---|---|---|
| `provider_answer` | AI engine answers to synthetic buyer-intent prompts about the client's own brand | legitimate interest | 90 days (then hash only) |
| `serp_public_search` | Public Google results (organic + AI Overview) for the client's own brand | legitimate interest | 90 days |
| `reddit_via_serp` | Public Reddit results **via SERP** — aggregates only | legitimate interest | 0 — never stored raw |
| `site_crawl_client` | The client's own website, crawled for the audit they bought | contract | 90 days |
| `google_places` | The client's own Maps listing, attached by the client in Pages | contract | 0 — pulled fresh per generate |
| `client_supplied` | Brand names, domains, URLs, descriptions typed by the client | contract | life of account |

Per-probe evidence rows (`citation_check`) carry `source_id` referencing this
registry, stamped at collection time by the worker. Rows predating the
migration keep `source_id = NULL` — we do not back-stamp provenance we did not
record when we collected.

## 3. Red lines (enforced in code, checked in CI)

1. **No Reddit Data API.** Reddit signals come exclusively from public SERP
   results. Direct Reddit Data API access requires a Reddit commercial data
   licence AND the GEO-A1 FTC disclosure (see `docs/compliance/regulatory-map.md`)
   — both absent, so the path stays closed. CI greps for Reddit API hosts.
2. **Own brand only (GEO-A2).** Audit probes and social signals query the
   client's own brand name, never a competitor's. Competitor names appear only
   in the engines' own answers, which we analyze but do not prompt for.
3. **Aggregates from social, never people.** From Reddit we store thread
   counts, subreddit names, and derived sentiment. No usernames, no comment
   bodies, no raw snippets at rest.
4. **PII scrub at the gateway.** Every probe query passes `scrubPii()`
   (deterministic regex: email, phone ≥9 digits, @handle) at the same
   chokepoint as the injection sanitizer (GEO-SEC-2), before fan-out to any
   external engine. Kinds are logged, values never.
5. **Text expires, hashes stay.** Collected query text purges to NULL after
   90 days via pg_cron; `query_hash` is retained for integrity.

## 4. What is deliberately NOT scrubbed

- **Ozvor Pages business data.** A business's phone, address, and email on
  its own landing page are the product, supplied by the client under contract
  to be published. Scrubbing them would break the deliverable. LGPD/GDPR
  protect natural persons; where a sole proprietor's business contact is also
  personal, publication remains under the client's own instruction (contract
  basis, client is controller for their page content).
- **Sales chat free text.** The support/sales widget answers the text the
  user typed, including any address they included on purpose. It already
  passes the injection sanitizer; a PII scrub there would corrupt legitimate
  questions. Chat transcripts follow the retention rules in the Privacy
  Policy, not this registry.

## 5. Change protocol

A provider ToS revision, a new source, or a retention change is a **reviewed
migration** updating `source_registry` — never an ad-hoc UPDATE. History is
git. New collection paths must add a registry row in the same PR that ships
the collector, or CI's provenance checks fail.

## 6. Sellable form

This registry is the raw material of the exportable audit report (Signal-Engine
spec §7): a customer-facing document generated from `source_registry` +
`citation_check.source_id` that answers the DPO's question in one page. That
export is future work; the data it needs is now recorded from day one.

---

*Owner: legal-privacy-officer (Compliance Council). Feeds: ROPA (#142), DPA
documentation (#143), Gate 7. Created 2026-08-06 as part of #159 (Signal-Engine
spec harvest).*

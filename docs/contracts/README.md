# Proposed service delivery contracts — B01 / L3

## TL;DR

These are operational product specifications, not legal terms, public offers, deployed features or approval to sell new capabilities. Version 0.1, prepared 2026-09-14 against OZVOR `ac423498ea1380b51a5b5fbb3a113a9d5e5c0147`. Visibility measures discovery and supports evidence-backed action; Stack improves a defined workflow. Each supports separately scoped diagnostic, software and managed execution modes where actually available. Neither requires buying the other or OrganicPosts. Price, scope, service dates, cadence, revision allowance and budgets require agreement before sale. Acceptance proves delivery, not guaranteed business growth. The founder reported 20 hours/week for sales and service; this plan conservatively treats that as total operational attention until clarified, with no additional staff assumed. Implementation, independent review and live proof remain pending. This document and the two product contracts define acceptance tests, not passing test results.

## 1. Contract identity and sale gate

Each order must reference one immutable contract version and a scope record containing:

- Customer, tenant/workspace, product and mode, accountable delivery owner, customer approver and contact.
- Problem, agreed success criterion, market/language, included assets/workflows and explicit exclusions.
- Actual availability, deliverable list, start date, acceptance window, service cadence, response/escalation commitments and revision allowance. Blank fields block the proposal; no implied unlimited service.
- Price/currency/taxes approved through the catalog, recurring versus one-time components, cancellation and refund terms, and spend limits. These documents create no prices, legal rights or new billing policy.
- Required access, approved data sources/purposes, approval authority, retention/export arrangements and dependencies the customer must provide.
- Estimated human effort, capacity reservation, maintenance purpose and a decision date; automation savings are not assumed capacity.

An amended scope creates a new version for customer approval. Do not silently expand scope, substitute a software plan for managed work or activate a future product from this specification. Existing orders require reconciliation with what was actually sold, not retroactive unilateral changes.

## 2. Shared lifecycle and responsibility

| Stage | Owner and required handoff | Customer-visible evidence |
|---|---|---|
| Qualify | Sales records need, current process, buyer/approver, budget and fit; GTM owns segment, positioning, package and channel decisions | Problem and proposed outcome, limitations, sample labelled as sample |
| Commit | Sales → delivery transfers approved scope/version and billing reference; delivery accepts capacity and access plan | What was bought, start conditions, contacts and next milestone |
| Onboard | Delivery validates tenant, inputs, least-privilege access and baseline; customer approves assumptions | Missing items, reasons, owners and agreed dates; no hidden blocked status |
| Deliver | Named operator produces versioned artifacts and evidence; customer approves material external actions | Progress, approval requests, cost/effort allowance and exceptions |
| Verify | Reviewer checks target, version, receipt and quality against contract; author does not self-approve | Accepted, rejected with reason, or inconclusive; evidence and next decision |
| Continue | Delivery → CX hands over history, risks, support/runbook and periodic review; RevOps reconciles subscription | Work done, observed change, unknowns, remaining priorities and value review |
| Renew/expand | CX records need and usage; Sales proposes an optional new scope after capacity review | Continue, reduce, change, pause or cancel; no forced cross-sell |
| Exit | CX/RevOps reconcile cancellation, access, scheduled work and billing according to agreed terms | Export, revocation confirmation, unresolved obligations and retention/deletion schedule |

RevOps links company/contact/deal/order/workspace/subscription using stable IDs, not only email strings. One-time diagnostics/setup and unpaid grants never count as MRR. Marketing may use a delivery result only with permission, provenance and qualification of attribution.

## 3. Approval, safety and failures

- Proposed state vocabulary: `draft → scoped → awaiting_inputs → ready → running → awaiting_approval → delivered → accepted → monitoring → closed`. `blocked`, `failed`, `rejected` and `cancelled` are explicit alternatives with reason, owner and next decision. This is a business contract, not an assertion that these enums exist in the database.
- Approval references artifact version, tenant, target, actor, action, permitted time window and spend cap. Editing a material claim, target, workflow or budget invalidates that approval. Acceptance does not imply approval for future external actions.
- Agents may collect permitted read-only evidence and prepare drafts within approved limits. Public posts, outbound messages, customer system writes, destructive changes, billing actions and paid calls require their applicable explicit authority. Production changes still follow [AGENTS.md](../../AGENTS.md); this document grants none.
- Stop on ambiguous tenant, expired access/approval, unavailable evidence, cap exhaustion or unsafe instructions in source content. Never report zero, successful publication or improved performance to conceal missing data.
- Failed/late work displays last successful evidence, affected deliverables, impact, recovery owner and proposed next update. Retries are bounded and idempotent; no automatic new purchase. Refund/credit decisions follow agreed terms and authorized billing controls, not an invented promise here.
- On cancellation, stop future unapproved work and paid scheduling at the agreed effective time, preserve contractual obligations, export entitled artifacts/history, revoke delegated access and follow the agreed retention process. Do not delete audit evidence or customer assets indiscriminately.

## 4. Disciplines without an unlimited bundle

| Discipline | Defined outcome and boundary |
|---|---|
| GTM / Sales | Segment/offer/channel decision; qualified need → demonstration → proposal → close. Research or a sent email is not a customer. |
| Marketing / organic platforms | Evidence becomes useful message, content and demand; publication, audience response and qualified opportunities are separate metrics. No engagement guarantee. |
| SEO / GEO | SEO: indexation, relevant organic visits and qualified conversions. GEO: mentions/citations by measured engine/surface/market panel. Never substitute a proprietary score for both. |
| Traffic / PPC | One acquisition operation and approved test budget; PPC is a paid modality, not a duplicate service/budget. Scenarios disclose assumptions and are not forecasts of guaranteed returns. |
| Landing pages / leads | A landing page improves a conversion surface; qualified lead generation also requires acquisition, consent, qualification and handoff. A page alone does not deliver leads. |
| Python / AI / RevOps | Collection, analysis, evaluation, controlled automation and lifecycle reconciliation support the contracted workflow; number of agents/jobs is not customer value. |

Only explicitly listed work is included. SEO, PPC, pages, outbound, content production and Signal access are not automatically included in either base diagnostic. OrganicPosts may supply separately scoped execution when appropriate; Stack can end with an operations implementation or a justified no-automation decision.

## 5. Capacity and operating economics

Founder input: **20 hours/week**, originally answering sales/service availability. No other executor is confirmed. Provisional total-attention allocation: **8h sales, 8h delivery/onboarding, 2h CX, 2h QA/management**. This allocation is proposed, not a commitment of delivery hours or an SLA.

Before accepting each start date, reserve estimated onboarding, review, support, rework and incident time against the remaining human budget. Record estimated versus actual effort per order/cycle alongside provider/tool cost. Set simultaneous sprint limits from observed workload; do not invent a fixed client cap before that measurement. At 2 human delivery hours per client/week, 8h holds at most four ongoing clients before reserve/onboarding. Ten managed clients would need no more than 48 minutes each in that bucket before reserve, which is unproven. Software, one-time buyers and DFY clients must therefore be reported separately. Goals of ten paid clients and USD10k MRR are goals, not capacity evidence or forecasts.

## 6. Data and AI use inventory — review required

| Data | Purpose / handling proposal |
|---|---|
| Contact, approver and billing references | Personal data; onboarding, support and account reconciliation; minimum fields and purpose-bound access |
| Brand, public URLs, prompts and source snapshots | Diagnostic evidence; may contain personal data; minimize/redact and record source rights, timestamp and retention basis |
| Workflow samples, events, recordings and artifacts | Operational baseline/verification; classify before ingestion; use synthetic or redacted cases first; sensitive data is not accepted by default |
| Credentials / delegated authorization | Least-privilege integration access only; never in reports, prompts, exports or repository; owner-managed secure storage and revocation |
| Approvals, receipts, run/cost logs and support history | Delivery accountability; tenant-isolated, versioned and retained under a reviewed schedule |

Retention durations, permitted providers, processing locations/transfers and customer deletion/export commitments must be recorded before onboarding, not guessed here. Review Brazil/LGPD, EU/GDPR and applicable US requirements with the existing privacy/compliance process; these are review tasks, not legal clearance. AI assists classification, recommendations and drafts; evidence references, human oversight, abstention and source-content injection safeguards are required. Customer data is not authorized as training data by these contracts.

## 7. Common acceptance matrix and dependency map

| ID | Given / When / Then | Dependency / proof to collect |
|---|---|---|
| B01-C1 | Given a diagnostic-only scope, when a buyer checks out, then the same version/mode is shown in fulfillment with exclusions and no managed-work implication | A06/A09/B01; catalog→order→delivery trace |
| B01-C2 | Given an approved artifact, when a material version or target changes, then external execution pauses for new approval | A05/A07/B02; old approval rejected, new approval audited |
| B01-C3 | Given a blocked dependency, when a milestone cannot complete, then status, owner and recovery/update decision are visible without a fabricated completion | A08/B02/B08; failure and delay scenarios |
| B01-C4 | Given two tenants, when one requests the other's evidence/export, then access is denied without leakage | A07/B02/B06; negative API/UI tests |
| B01-C5 | Given cancellation or revoked permission, when a future paid/external action is due, then it does not execute outside surviving authorized obligations | A06/A08/B08; schedule, access and billing reconciliation |
| B01-C6 | Given insufficient reserved human capacity, when Sales proposes another managed start, then delivery rejects/renegotiates the date before commitment | B07/B08/B11; capacity ledger and handoff review |
| B01-C7 | Given no evidence of a second-product need, when reviewing renewal, then continuation/export/cancellation remain available without cross-sell | B01/B07/B08; proposal and CX review |
| B01-C8 | Given optional channels not purchased, when base delivery is generated, then PPC/SEO/content/Signal work is not silently sold, billed or activated | A09/B03–B06/B09–B11; scope/entitlement tests |

Package IDs refer to the 2026-09-14 completion plan supplied with this change; they are planning references, not repository paths. A01–A09 cover metric integrity, Visibility, repeated observations, comparison, Do Next, billing, isolation, recovery and catalog truth. B02–B11 cover delivery portal, editorial, TRIBE context, Signal internal/client, Sales, RevOps/CX, channel outcomes, traffic/conversion and capacity. Full product-specific tests: [Visibility](visibility-delivery.md) and [Stack](stack-delivery.md). Evidence must name contract version, source SHA, test/canary ID, reviewer and date. A passing documentation check alone does not satisfy any operational row.

## Handoff

**Status:** draft operational specification; LOW-risk documentation only; no self-approval, implementation or production authorization.
**Next agent:** spec-reviewer, then founder for commercial scope/capacity decisions; existing compliance gates remain open until independently resolved.
**Context:** this README, both product contracts, [AGENTS.md](../../AGENTS.md), and the accompanying completion plan/debate.
**Open decisions:** initial segment/market, modes actually available, agreed dates/cadence/revisions, pricing source, retention/access, capacity and paid-test limits.

---
Handoff to: spec-reviewer

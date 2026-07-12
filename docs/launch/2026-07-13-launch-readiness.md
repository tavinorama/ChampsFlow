# OZvor Launch Readiness — Monday 2026-07-13

> Owner: Hermes / CEO-Chief-of-Staff lens  
> Created: 2026-07-08 · **Refreshed: 2026-07-12 (launch eve, full QA audit — 5-dimension sweep + adversarial P0 verification)**  
> Scope: product, sales, marketing, CX, legal/compliance, operations, and founder gates for a focused launch push by Monday 2026-07-13.  
> Rule: no paid APIs, outbound sends, live production/destructive actions, pricing changes, or customer-impacting commitments without founder approval.

## Executive verdict — UPDATED 2026-07-12 (launch eve)

OZvor is **ready for a founder-led soft launch tomorrow. Exactly one gate
stands before unrestricted paid traffic: the paid-path smoke (issue #261).**

Since this doc was written (2026-07-08), reality moved substantially PAST it —
the original verdict now *understates* readiness:

- **Public surface: GREEN.** All 23 public URLs return 200; the automated link
  crawler verified 45/45 sitemap+nav URLs 2xx; brand is clean (0 user-facing
  "trustindex"); OG cards render; API healthy, `mode: "live"`, all audit
  providers + Supabase + Stripe connected.
- **Security: the entire Hermes audit (#261/#262) is remediated in code.**
  8 PRs merged 2026-07-11/12 (#256–#268): billing CRITICAL session-binding fix,
  XFF rate-limit bypass, CSS injection, DPA fail-closed gate, fail-closed money
  guards, no-fake-scarcity, daily link-crawl QA. Zero open PRs; main 8/8 green.
- **Operating system: stood up.** Support macros + KB (closes #161), week-1 CRM
  + first-50 workflow (closes #160), 3 LinkedIn posts drafted, claims/disclaimer
  pass shipped (#162/#163), Tier-1 channels 4/6 done (GSC #115, Bing #116,
  GA4 #117, LinkedIn #119 all CLOSED; Reddit #118 aging; GBP deferred).
- **Legal identity: RESOLVED.** Razão social (MEI) + CNPJ + registered address
  are live on /privacy-policy — the long-standing "entity pending" blocker is
  closed.

**The one verified P0:** issue #261's "Mandatory smoke before sale" checklist is
unchecked and Hermes' directive — *do not launch unrestricted paid traffic until
resolved* — stands. Decision for tonight/tomorrow morning: run the ~15-min Kit
smoke (checkout → webhook → email → `/kit/[token]` → refund), **or** launch
soft with paid checkout treated as unproven (monitor the first real purchase
as if it were the smoke). Everything else on the launch-eve list is founder
paperwork measured in minutes, not days (see the updated approvals table).

<details><summary>Original 2026-07-08 verdict (kept for the record)</summary>

OZvor is **sellable but not yet fully launch-operated**.

The public product surface is substantially live: `ozvor.com`, `/test`, `/kit`, `/pricing`, `/results`, `/organicposts`, `/book`, `/learn`, `/agencies`, `/blog`, and `/vs` return `200`; the funnel copy exists; the free test and Kit pages exist; Stripe/self-serve surfaces are represented; and the public pages no longer leak the old TrustIndexAI brand except for one legal explanatory reference distinguishing Ozvor from Trustindex.io.

The remaining launch gap is not “build the whole product.” The gap is **operating system + first-revenue readiness**:

1. prove the paid path end-to-end;
2. activate measurement/attribution;
3. make sales/RevOps concrete instead of blank STATE docs;
4. stand up launch channels and founder-facing assets;
5. close obvious CX/support/legal blockers;
6. avoid external execution until founder crivo.

If we try to launch on Monday without these, the site may look launched but the business will run blind.

</details>

---

## Current-state evidence

### Verified from live public surface on 2026-07-08

| Surface | Status | Observed |
|---|---:|---|
| `/` | ✅ `200` | Has Free Test, Kit, Growth, Agency, OrganicPosts ladder. |
| `/test` | ✅ `200` | Has form; Free AI Invisibility Test page exists. |
| `/kit` | ✅ `200` | Has form; Kit $29 page exists; upsells Growth/Agency/OrganicPosts. |
| `/pricing` | ✅ `200` | Growth/Agency pricing surface exists. |
| `/results` | ✅ `200` | Live case-study page exists; uses production-style positioning. |
| `/organicposts` | ✅ `200` | Done-for-you surface exists. |
| `/book` | ✅ `200` | Strategy-call surface exists. |
| `/learn` | ✅ `200` | Tutorial surface exists. PR #155 adds/updates Ozvor-produced tutorial/demo video content. |
| `/agencies` | ✅ `200` | Agency positioning exists. |
| `/blog` | ✅ `200` | Blog exists with GEO/AI Search articles. |
| `/vs` | ✅ `200` | Comparison page exists. |
| `/privacy-policy`, `/terms-of-service`, `/legal/dsr-request`, `/legal/do-not-sell` | ✅ `200` | Legal/rights pages exist publicly. |

### GitHub state — REFRESHED 2026-07-12 (launch eve)

| Item | Status 2026-07-12 | Meaning for Monday |
|---|---:|---|
| PR #155 — nav + tutorials | **MERGED 2026-07-08** (as honest *written* tutorials, no fabricated videos) | ✅ Done — the "needs approval" rows below in the original tables are obsolete. |
| Open PRs | **ZERO** | Nothing stranded in review; main is 8/8 green CI incl. the final #268 launch-polish merge. |
| Hermes audit #262 (billing CRITICAL) | **CLOSED 2026-07-12** via PR #263 (session binding + atomic credit) | ✅ The payment-bypass hole is shut and unit-tested. |
| Hermes audit #261 (full QA) | **OPEN — the one verified P0** | All *coded* items shipped (#256–#268), but the "Mandatory smoke before sale" checklist is unchecked and the "no unrestricted paid traffic" directive stands. Founder: run the Kit smoke or launch soft; then tick the shipped boxes + re-scope the 3 addendum leftovers (RLS boot ordering, migration deploy path, /l/* perf) into fresh issues. |
| Issues #115 GSC / #116 Bing / #117 GA4 / #119 LinkedIn | **ALL CLOSED-COMPLETED 2026-07-10** | ✅ Tier-1 channels 4/6 — measurement/attribution exists. |
| Issue #118 — Reddit account aging | Open | Create/warm the account now; karma/age cannot be parallelized later. No posting except legit manual participation. |
| Issue #120 — Google Business Profile | Unblocked (entity resolved) but deferred | Not needed for a non-local launch. |
| Issues #146 agentic OS / #152 brand kits / #153 social login / #217 cost control | **ALL CLOSED** | ✅ |
| Issue #222 — E2E slow on CI runner | Open (mitigated: E2E is nightly/advisory, not a merge gate) | Background investigation; not launch-relevant. |
| New scheduled QA | link-crawl.yml daily **07:00 UTC** + E2E nightly 06:00 UTC on main | Launch morning gets an automated link-health signal before the founder wakes up. |

### Known company-state blockers — REFRESHED 2026-07-12

| Blocker | State 2026-07-12 | Launch impact |
|---|---|---|
| Real paid-path smoke | **STILL OPEN — the one P0** (issue #261). Kit binding/webhook/idempotency all verified in code; what's missing is one real end-to-end run. | Run the ~15-min Kit smoke, or launch soft with paid unproven. |
| Metrics/attribution | **RESOLVED** — GA4 (#117), GSC (#115), Bing (#116) closed-completed. | Watch the dashboards Monday. |
| Citation infrastructure | **4/6 done** (GSC, Bing, GA4, LinkedIn). Reddit aging (#118); GBP deferred. | P1 launch-week. |
| Legal entity details | **RESOLVED 2026-07-08** — razão social (MEI) + CNPJ + address live on /privacy-policy. | Two real legal leftovers instead: Encarregado formal appointment (the live Privacy Policy already *claims* one — appoint or soften wording) + EU Art. 27 rep before EU users; 11 sub-processor DPA confirmations (~1–2h clickwrap checking). |
| Department STATE docs | Sales/CX **stood up** (CRM tracker + macros + KB on main); docs/STATE.md + company/STATE.md still narrate old eras. | P1 docs hygiene — flagged for product-manager/ceo-agent refresh; does not affect customers. |

---

## What we have vs. what we must have by Monday

### 1. Product and funnel

| Area | Have now | Must have by Monday | Priority |
|---|---|---|---:|
| Public ladder | Free Test → Kit → Growth/Agency → OrganicPosts visible | Keep as the only launch narrative; no side quests | P0 |
| Free test | Page and form exist | Confirm form submission → lead capture → result/scorecard path with a non-paid test | P0 |
| Kit $29 | Page and checkout copy exist | Confirm one paid Kit purchase path in Stripe test/live founder-controlled mode, webhook, email, `/kit/[token]` rendering | P0 founder-gated |
| Growth/Agency | Pricing exists | Confirm login → checkout intent → Stripe session; verify post-payment plan state or document current limitation | P0 founder-gated |
| OrganicPosts | Page/book call exists | Define a concrete Sprint offer: price range, inclusions, call close script, proposal template | P0 |
| Dashboard/product CX | PR #155 pending | Merge if founder/other reviewer approves; otherwise launch can proceed without it | P1 |
| Tutorials/videos | `/learn` exists; PR #155 improves content | Merge PR #155 or create fallback written tutorials for Free Test, Kit, Growth/Agency, OrganicPosts | P1 |

**Product launch principle:** do not add major features before Monday. Stabilize the paid path and make the ladder obvious.

---

### 2. Sales / RevOps

| Area | Have now | Must have by Monday | Priority |
|---|---|---|---:|
| Sales playbook | Strong playbook exists in `docs/marketing/sales-playbook.md` and `docs/departments/sales/first-week-playbook.md` | Collapse into one Monday execution pack: ICP, scoring, sequence, daily quota, CRM stages | P0 |
| CRM | `docs/departments/sales/STATE.md` says CRM blank | Choose Notion/GitHub/CSV as no-cost CRM for week 1; define columns | P0 |
| Lead source | Playbook lists agencies/SMBs and communities | Produce first 50 target leads, but do not send outbound until founder approves copy and legal address/opt-out line | P0/P1 gated |
| Sequences | Email + LinkedIn templates exist | Finalize launch-safe sequence with physical-address placeholder resolved; no invented audit result | P0 gated |
| Close path | Kit/Growth/Agency scripts exist | One-page proposal template for OrganicPosts Sprint; call agenda; objection handling | P0 |
| Metrics | Blank | Track: lead, source, ICP, score, status, next action, value, last touch, owner | P0 |

**Week-1 sales motion:** free-test-first, not “buy my SaaS.” Every prospect gets one factual finding or no outbound.

---

### 3. Marketing / demand generation

| Area | Have now | Must have by Monday | Priority |
|---|---|---|---:|
| Positioning | Strong: audit + execute, not monitoring-only | Keep tagline: “The AI-search tool that turns visibility gaps into publishable fixes.” | P0 |
| Website | Main pages exist | Reduce nav/CTA confusion only if safe; otherwise keep stable | P1 |
| Proof | `/results` exists with Ozvor dogfood | Turn Ozvor’s own audit into 3 launch assets: LinkedIn post, short case-study thread, landing proof block | P0 |
| Channel setup | GitHub issues #115–#119 exist | Complete free channels: GSC, Bing/IndexNow, GA4, LinkedIn, Reddit account creation/aging | P0/P1 founder/account gated |
| Content | Blog exists | Launch-week content calendar: 3 LinkedIn posts + 2 short blog/case updates + 1 founder announcement | P0 |
| Competitor pages | `/vs` exists | Do not overbuild. Use `/vs` as single comparison hub for launch. | P1 |
| Paid ads | Issue #123 exists | No spend before founder says yes. Accounts only, tracking only. | Gated |

**Marketing launch principle:** Monday launch is founder-led and proof-led. No fake testimonials, no guaranteed citations, no mass Reddit posting.

---

### 4. Customer Experience / support

| Area | Have now | Must have by Monday | Priority |
|---|---|---|---:|
| Tutorials | `/learn` exists; PR #155 improves videos | Free Test, Kit, Growth, Agency, OrganicPosts tutorial path visible | P1 |
| Post-purchase support | Legal/support pages exist; CX STATE blank | Support email route and response macros for: “Kit missing,” “audit failed,” “refund,” “how to publish drafts,” “cancel plan” | P0 |
| Incident handling | Runbooks exist | Monday launch support SLA: first response <4h, refund escalation founder-gated, bug triage to GitHub | P0 |
| Refund guarantee | Terms mention paid-plan 30-day money-back; Kit page has guarantee copy | Align exact Kit guarantee language across `/kit`, Terms, support macro | P0 |
| Customer feedback loop | Blank | Add “launch feedback” tracker: user, issue, severity, page, owner, resolution | P0 |

---

### 5. Legal / compliance / claims

| Area | Have now | Must have by Monday | Priority |
|---|---|---|---:|
| Public legal pages | Privacy, Terms, DSR, Do Not Sell exist | Verify company identity is accurate enough for public use; add registered address/razão social if founder supplies | P0 founder-gated |
| Claims | Strong disclaimers in docs; public pages inconsistent on “directional/non-deterministic” language | Add/confirm disclaimers near Free Test / Kit / pricing: no guaranteed ranking/citation | P0 |
| Outbound compliance | Playbook requires physical address + opt-out | Do not send cold outbound until physical address and opt-out process are resolved | P0 gated |
| DPAs / sub-processors | Docs partially stale from Portugal → Brazil transition | Update legal STATE to Brazil/LGPD reality; list exact unresolved DPAs without stale Portugal claims | P1 |
| Reddit/community | Playbook says listening, not spam | Manual participation only; no astroturfing, no fake personas, no automated posting | P0 |

---

### 6. Operations / company cadence

| Area | Have now | Must have by Monday | Priority |
|---|---|---|---:|
| Operating model | `operating-cadence.md` exists | Activate launch-specific daily command center: blockers, PRs, metrics, approval queue | P0 |
| Department STATES | Sales/CX blank; Marketing/Legal stale | Refresh department STATE docs to Monday-launch reality | P0 |
| Approval queue | Concept exists | Founder-facing list of decisions needed before Monday | P0 |
| PR process | Working; #155 pending approval | No merge if CI red; HIGH/CRITICAL/founder-gated remain gated | P0 |
| QA | Recurring proactive QA exists | Daily launch smoke: public pages, `/test`, `/kit`, checkout path if approved, emails, downloads, API health | P0 |

---

## Founder actions — LAUNCH EVE LIST (refreshed 2026-07-12; original table below)

Everything here is minutes, not days. In priority order:

| # | Action | Time | Why |
|---|---|---:|---|
| 1 | **Paid-path smoke** (issue #261): buy the Kit $29 yourself → webhook fires → delivery email arrives → `/kit/[token]` renders → refund in Stripe. Then tick the shipped checkboxes on #261. | ~15 min | The ONE verified P0. Hermes' "no unrestricted paid traffic" directive lifts with this. Alternative: launch soft and treat the first real purchase as the smoke (watch it live). |
| 2 | **Stripe Dashboard → Settings → Payment methods**: confirm only instant methods (card / Apple Pay / Google Pay / Link) are enabled. | 5 min | The webhook trusts `checkout.session.completed` without re-checking `payment_status`; delayed methods (boleto) would grant access before money clears. |
| 3 | **Approve the 3 LinkedIn posts** (`docs/departments/marketing/linkedin-launch-posts.md` — Mon/Wed/Fri + DM template). | 10 min | Drafted and waiting; approval is the only missing half of that P0 box. |
| 4 | **Send-yourself test on `support@ozvor.com`**. | 2 min | Macros + SLA exist on main; the only thing the repo can't verify is that the inbox actually delivers to you. |
| 5 | **Encarregado**: formally self-appoint (record in ROPA) — or ask for the Privacy Policy wording to be softened. | 10 min | The live page *states* an Encarregado "has been appointed"; make the statement true (cleanest) rather than false on a legal page. |
| 6 | **Populate the first-50 CRM rows** + approve/deny the outbound template. No sends without your crivo. | founder-paced | CRM schema + workflow are live on main (closes #160). |
| 7 | **Reddit account** created/warming (#118). No posting. | 5 min | Age/karma can't be rushed later. |
| 8 | Launch-week (not eve): confirm the 11 sub-processor DPA clickwraps (~1–2h), EU Art. 27 rep decision, Gate 7 verdict or logged waiver. | launch week | US-first posture defers, doesn't delete, these. |

<details><summary>Original 2026-07-08 approvals table (superseded)</summary>

| Decision | Why it matters | Needed by |
|---|---|---|
| Approve/perform a controlled paid-path smoke test | Proves checkout → webhook → delivery before selling | Thursday |
| Provide/confirm razão social + registered address or approve temporary public wording | Legal/outbound/GBP/terms | ✅ Resolved 2026-07-08 |
| Approve external outbound policy for launch week | We can draft, but not send real cold emails without crivo | Friday |
| Approve launch offer wording and any discounts | Pricing/positioning changes are gated | Friday |
| Approve PR #155 merge or accept launching without it | Video/tutorial polish | ✅ Merged 2026-07-08 |
| Confirm no paid ads/API spend before Monday unless explicitly approved | Keeps budget guardrail intact | Always |

</details>

---

## Monday launch definition of done

OZvor is “ready for Monday launch” when all P0 items below are green or explicitly waived by the founder.

### P0 checklist — state verified 2026-07-12 (launch-eve QA audit)

- [x] Live public pages return `200` — ✅ all 23 URLs 200 + crawler 45/45 2xx (2026-07-12; re-runs automatically daily 07:00 UTC via link-crawl.yml).
- [ ] 🧑 Free Test form path verified without spending money — form + lead capture exist; founder rehearsal recommended tonight (5 min, no cost).
- [ ] 🧑 **Kit $29 paid path verified via founder-approved smoke** — THE remaining P0 (issue #261). Code side fully verified (session binding #263, webhook signature+idempotency, delivery route); the one real run is founder-held.
- [ ] 🧑 Growth/Agency checkout verified enough to sell — same smoke session; alternatively mark "call-first" for day 1.
- [x] Support route + macros — ✅ `docs/support/macros.md` ACTIVE (closes #161), SLA <4h, refunds founder-gated. 🧑 2-min send-yourself test on support@ozvor.com still recommended.
- [x] Refund/guarantee wording aligned — ✅ shipped (#162 pass + Kit guarantee alignment, commits cc91877 + 9e01123).
- [x] Sales CRM for week 1 — ✅ `docs/departments/sales/crm-tracker.md` + week1-crm.csv + first-50 workflow (closes #160). 🧑 Founder populates the 50 rows.
- [x] Launch-safe outreach templates finalized, not sent — ✅ in the sales pack; outbound explicitly founder-gated.
- [~] 3 founder LinkedIn posts — ✅ drafted (`linkedin-launch-posts.md`: Mon/Wed/Fri + DM template). 🧑 Approval pending.
- [x] Ozvor dogfood case asset — ✅ `/results` live (200) with the real score; Post 3 (Friday) is the evidence post.
- [x] GA4 + UTM — ✅ issue #117 closed-completed 2026-07-10.
- [x] GSC + Bing/IndexNow — ✅ issues #115 + #116 closed-completed 2026-07-10.
- [x] Legal identity/address — ✅ RESOLVED: MEI razão social + CNPJ + registered address live on /privacy-policy. (Follow-ups now tracked separately: Encarregado appointment, Art. 27 rep.)
- [x] No stale TrustIndexAI assets — ✅ home has 0 "trustindex" strings; legacy kits removed (#152 closed).
- [x] Daily launch QA active — ✅ link-crawl.yml (daily 07:00 UTC, fails loudly) + nightly E2E on main.

**P0 bottom line: 12 of 15 green. The 3 open boxes are founder-held and total ~25 minutes (free-test rehearsal + the Kit smoke + LinkedIn approval).**

### P1 checklist — state verified 2026-07-12

- [x] PR #155 — ✅ MERGED 2026-07-08 as honest *written* tutorials (no fabricated videos).
- [ ] 🧑 LinkedIn company page + founder profile updated (issue #119 closed the channel setup; profile polish is founder-held).
- [ ] 🧑 Reddit account created/aging (#118); no posting except legit manual participation.
- [x] `/vs` as the single comparison hub — ✅ live, plus /vs/* per-competitor pages shipped since.
- [x] OrganicPosts Sprint proposal template — ✅ in the sales pack (battlecards + proposal one-pager, #160 batch).
- [x] CX knowledge base 5 articles — ✅ `docs/support/kb/` on main.

---

## Execution calendar

### Wednesday 2026-07-08 — command center and blockers

- Create this launch readiness doc and PR.
- Confirm open PRs/issues and live page status.
- Founder receives approval list.
- Draft support macros, sales CRM schema, and LinkedIn posts.

### Thursday 2026-07-09 — prove money path

- Founder-approved payment smoke for Kit and/or Growth.
- Verify webhook/delivery/token rendering.
- Fix any paid-path breakage immediately via hotfix PR.
- Resolve legal identity/address wording or document waiver for soft launch.

### Friday 2026-07-10 — activate sales/marketing assets

- Finalize CRM and first 50 lead list.
- Finalize 3 LinkedIn posts and Ozvor dogfood case asset.
- Finalize launch-safe outbound sequence, but do not send until founder approval.
- Merge PR #155 if approved and gates are satisfied.

### Saturday 2026-07-11 — QA and channel infrastructure

- Full public smoke test.
- Verify GSC/Bing/GA4/channel setup where possible.
- Clean/avoid stale TrustIndexAI assets.
- Check mobile CTA visibility.

### Sunday 2026-07-12 — freeze and rehearsal — ✅ EXECUTED (audit + polish, no new features)

- ✅ Full launch-eve QA audit run (5 dimensions + adversarial P0 verification) — this refresh is its output.
- ✅ Hermes audit fully closed in code: #263 billing CRITICAL, #258 XFF, #266 fail-closed, #267 DPA gate, #268 P3 polish all merged; zero open PRs; main green.
- ✅ Automated daily QA armed (link-crawl 07:00 UTC + nightly E2E).
- 🧑 Remaining tonight: the founder launch-eve list above (items 1–7, ~45 min total).

### Monday 2026-07-13 — launch

- 07:00 UTC: check the Actions tab — the daily link-crawl gives a fresh link-health signal before anything else.
- Publish founder launch post (Post 1 "Search moved" — pre-approved).
- Monitor: free-test completions, Kit purchases (**watch the FIRST purchase end-to-end if the smoke was skipped**), checkout errors, support inbox, `/healthz`.
- Send only founder-approved outbound.
- End-of-day report: traffic (GA4), leads (CRM), purchases, issues, fixes, next actions.

---

## Launch week and beyond (the "future" queue, priority-ordered)

**Launch week (code, small):**
1. Refund/dispute revocation in the webhook (task #123) — until it ships, founder playbook: on any refund, also cancel the sub / revoke the Kit manually in Stripe + admin.
2. `checkout.session.completed` → check `payment_status === 'paid'` (pairs with #123; removes the payment-methods constraint).
3. Remove internal env-var names from public `/api/system/capabilities` (2-line fix, security-review Finding 3).
4. Re-scope the 3 unresolved #261 addendum items into fresh issues: RLS boot ordering, migration deploy path verification, /l/* Pages performance (Perf 40 / LCP 5.5s) — then close #261.
5. Home `<title>` duplication ("Ozvor — … | Ozvor") — SEO polish.
6. `WEB_ORIGIN` required-in-production (mirror the DPA_CURRENT_VERSION pattern).

**Launch week (founder/legal):**
7. Sub-processor DPA confirmations (11 clickwraps, ~1–2h) + GEO-D1 provider EU-path notes.
8. Gate 7 council pass or logged waiver; Encarregado + Art. 27 decisions if EU/BR users appear.
9. External counsel engagement (ToS/Privacy review + GEO-A1 FTC sign-off + trademark search — one bundle).

**Before enabling Ozvor Pages $99 (one env var, but gated on):**
10. Pages regen-quota bypass (task #121) + mock-mode disclosure in prod (task #122) + the /l/* perf item above. Until then Pages stays cleanly OFF (honest 503 + UI fallback — verified).

**Product roadmap (post-launch):** Pages generation upgrade to brila-level (task #125, in progress), worker-boot smoke test (#126), E2E CI speedup (#222), V2 capture items (per-engine competitor detail, GEO calendar).

---

## Immediate implementation tickets to create or close

1. **P0 — Launch command center / this PR**: source of truth for Monday readiness.
2. **P0 — Paid-path smoke**: founder-gated runbook and verification checklist.
3. **P0 — Sales CRM week-1 schema + first 50 lead workflow**.
4. **P0 — Support macros + launch support inbox verification**.
5. **P0 — Claim/guarantee/disclaimer consistency pass** across Free Test, Kit, Pricing, Terms.
6. **P1 — Merge PR #155 or publish written tutorial fallback**.
7. **P1 — Remove/quarantine TrustIndexAI brand kits** via issue #152.

---

## Non-negotiables

- No guaranteed ranking/citation claims.
- No fake testimonials, fake metrics, or invented customer stories.
- No Reddit spam, fake personas, or vote manipulation.
- No paid ads or paid APIs without explicit approval.
- No external outbound to real leads until founder approves the exact template, opt-out, sender identity, and address line.
- No merge if required CI is red.
- Merge to `main` means deploy; treat every merge as production.

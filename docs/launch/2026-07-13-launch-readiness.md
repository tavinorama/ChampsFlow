# OZvor Launch Readiness — Monday 2026-07-13

> Owner: Hermes / CEO-Chief-of-Staff lens  
> Created: 2026-07-08  
> Scope: product, sales, marketing, CX, legal/compliance, operations, and founder gates for a focused launch push by Monday 2026-07-13.  
> Rule: no paid APIs, outbound sends, live production/destructive actions, pricing changes, or customer-impacting commitments without founder approval.

## Executive verdict

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

### GitHub state observed 2026-07-08

| Item | Status | Meaning for Monday |
|---|---:|---|
| PR #155 — RankLayer-inspired navigation + Ozvor-produced video content | Open; six required checks green; authored by `ozvor-hermes` | Needs founder/other reviewer approval before merge if branch protection requires non-author approval. High-value for CX/landing polish, not a revenue blocker. |
| Issue #153 — optional social login | Open | Useful but not Monday-blocking unless magic-link conversion is bad. |
| Issue #152 — quarantine/remove legacy TrustIndexAI brand kits | Open | LOW cleanup; avoid anyone using stale assets for launch channels. |
| Issues #115–#119 — Tier-1 channels | Open | Launch-critical marketing infrastructure: GSC, Bing/IndexNow, GA4, Reddit, LinkedIn. |
| Issue #120 — Google Business Profile | Blocked | Requires registered address/entity details. Not required for Monday if we are not local-service selling. |
| Issue #146 — agentic operating system | Open | Relevant because launch needs daily digest / approval queue / department ownership. |

### Known company-state blockers from `docs/company/STATE.md`

| Blocker | Current state | Launch impact |
|---|---|---|
| Real paid-path smoke | Current: 0 verified real Growth annual purchase / webhook / delivery end-to-end | **P0**. Cannot confidently sell paid plans until proven. Founder-gated. |
| Metrics/attribution | Customer count, MRR, traffic = unknown / needs instrumentation | **P0**. Sales/marketing cannot optimize blind. |
| Citation infrastructure | Tier-1 channels current 0/6 | **P0/P1**. For a GEO company, channels are proof + citation inputs. |
| Legal entity details | Razão social + registered address pending | **P0/P1**. Blocks final legal/ROPA and Google Business Profile. |
| Department STATE docs | Sales/CX mostly blank; Marketing/Legal stale in places | **P0** operational gap. The company can’t run from blank dashboards. |

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

## Founder approvals needed before Monday

| Decision | Why it matters | Needed by |
|---|---|---|
| Approve/perform a controlled paid-path smoke test | Proves checkout → webhook → delivery before selling | Thursday |
| Provide/confirm razão social + registered address or approve temporary public wording | Legal/outbound/GBP/terms | Thursday |
| Approve external outbound policy for launch week | We can draft, but not send real cold emails without crivo | Friday |
| Approve launch offer wording and any discounts | Pricing/positioning changes are gated | Friday |
| Approve PR #155 merge or accept launching without it | Video/tutorial polish | Friday |
| Confirm no paid ads/API spend before Monday unless explicitly approved | Keeps budget guardrail intact | Always |

---

## Monday launch definition of done

OZvor is “ready for Monday launch” when all P0 items below are green or explicitly waived by the founder.

### P0 checklist

- [ ] Live public pages return `200`: `/`, `/test`, `/kit`, `/pricing`, `/results`, `/organicposts`, `/book`, `/learn`, `/agencies`, `/blog`, `/vs`, legal pages.
- [ ] Free Test form path verified without spending money.
- [ ] Kit $29 paid path verified via founder-approved smoke: checkout, webhook, delivery email, `/kit/[token]` render.
- [ ] Growth/Agency checkout path verified enough to sell or clearly marked as “call-first” if not.
- [ ] Support route works: `support@ozvor.com` or equivalent, with macros for top 5 launch issues.
- [ ] Refund/guarantee wording aligned across Kit, Pricing, Terms, and support macro.
- [ ] Sales CRM for week 1 exists with first 50 targets or first inbound leads tracked.
- [ ] Launch-safe outreach templates finalized but not sent until founder approval.
- [ ] 3 founder LinkedIn posts drafted and approved.
- [ ] Ozvor dogfood case asset ready from `/results`.
- [ ] GA4 or equivalent analytics + UTM convention live or explicitly waived.
- [ ] GSC + Bing/IndexNow setup in progress or done.
- [ ] Legal identity/address/public wording resolved or explicitly waived for soft launch.
- [ ] No stale TrustIndexAI assets are used in any launch profile/channel.
- [ ] Daily launch QA job/report active through launch week.

### P1 checklist

- [ ] PR #155 merged or equivalent tutorial fallback published.
- [ ] LinkedIn company page and founder profile updated.
- [ ] Reddit account created/aged; no posting except legitimate manual participation.
- [ ] `/vs` used as the comparison hub; no need to build individual competitor pages pre-Monday.
- [ ] OrganicPosts Sprint one-page proposal template ready.
- [ ] CX knowledge base has 5 articles: run test, buy Kit, publish drafts, retest in 30 days, cancel/refund.

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

### Sunday 2026-07-12 — freeze and rehearsal

- No broad new features.
- Rehearse: visitor → free test → Kit → support/upsell.
- Prepare Monday launch post and first-response support plan.

### Monday 2026-07-13 — launch

- Publish founder launch post.
- Monitor test completions, Kit purchases, checkout errors, support inbox, API health.
- Send only founder-approved outbound.
- End-of-day report: traffic, leads, purchases, issues, fixes, next actions.

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

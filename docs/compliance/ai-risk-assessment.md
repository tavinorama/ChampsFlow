# AI Risk Assessment

> Owner: `ai-ethics-reviewer` · Created at gate 2→3 · Updated at 3→4 and 6→7

## Inventory of AI features
| # | Feature | Purpose | Inputs | Outputs | Human-in-loop |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |

## EU AI Act classification (per feature)

For each feature, classify:
- [ ] **Prohibited** (Art. 5) — STOP, redesign required (e.g., subliminal manipulation, social scoring, real-time remote biometric ID in public, emotion recognition in workplace/education)
- [ ] **High-risk** (Annex III) — full conformity assessment required (e.g., employment AI, education AI, credit scoring, critical infrastructure, law enforcement, migration/border, justice, biometric categorization)
- [ ] **Limited-risk transparency** (Art. 50) — disclosure required (chatbots, AI-generated content, emotion recognition non-prohibited contexts, deepfakes)
- [ ] **Minimal-risk** — no specific obligations beyond general law

GPAI provider obligations (if you provide a foundation model): documentation, training data summary, copyright compliance.
GPAI deployer obligations (if you use someone else's foundation model): operate within their terms; assess systemic risk if model is "with systemic risk" (10^25 FLOPs).

## US sectoral exposure
- [ ] Employment / hiring → EEOC + state AEDT laws (NYC LL 144 bias audit; IL AI Video; CA SB-942)
- [ ] Housing → Fair Housing Act + HUD guidance
- [ ] Credit / lending → ECOA + FCRA + adverse action notices
- [ ] Education → FERPA + state student privacy
- [ ] Health / medical → HIPAA + FDA SaMD if diagnostic
- [ ] Insurance → state DOI rules (CO, NY, etc.)
- [ ] Consumer-facing → Colorado AI Act, FTC §5 unfair AI

## Foundation model dependencies
| Model | Provider | Hosting (EU/US/other) | PII to provider? | Training data isolation |
|---|---|---|---|---|

## Training data
- Sources:
- Personal data in training? Lawful basis?
- Scraped content rights cleared?
- Opt-out mechanism for data subjects?

## Inference-time data flows
- PII sent to third-party model? (yes/no per feature)
- Logging / retention by provider:
- Region of inference (EU residency required?):

## Bias / fairness plan
- Protected classes evaluated:
- Metrics (e.g., demographic parity, equalized odds, calibration):
- Disparate-impact threshold (4/5ths rule baseline; tighter if regulated sector):
- Drift monitoring in production:
- Periodic re-audit cadence:

## Human oversight model
- Where humans review:
- Override mechanism:
- Contestation path (UX §7):
- Logging of overrides (for audit):

## Output safety controls
- Hallucination mitigation:
- Toxic content filtering:
- Prompt injection / jailbreak resistance:
- Output rate limiting:

## Transparency disclosures
- [ ] Users informed they interact with AI (EU AI Act Art. 50)
- [ ] AI-generated content marked (Art. 50 + CA SB-942 if applicable)
- [ ] Public model card available (link)
- [ ] CO AI Act notice (if deployed in CO consumer context)

## Conformity assessment plan (high-risk only)
- Risk management system:
- Data governance:
- Technical documentation:
- Record-keeping:
- Transparency to deployers/users:
- Human oversight:
- Accuracy, robustness, cybersecurity:
- Notified body involvement (if Annex III):
- EU database registration:

## Approval
- Author: ai-ethics-reviewer agent
- Reviewed by (human): _____
- Date:

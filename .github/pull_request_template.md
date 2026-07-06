# Summary

<!-- What does this PR do, in 2-4 sentences. -->

## Scope

<!-- What is in scope and explicitly out of scope. -->

## Risk level

<!-- Exactly one, per AGENTS.md §2. Set by the HIGHEST-risk file touched. When in doubt, pick the higher level. -->
- [ ] LOW — docs, UI copy, simple pages, tests → green CI merges directly
- [ ] MEDIUM — package/config, migrations, infra-as-code, test-mode integrations → Hermes approval
- [ ] HIGH — auth, RLS, billing code, email sending, domain/DNS, deploy config → Hermes + founder approval
- [ ] CRITICAL — production data, live Stripe, live DNS, paid APIs, destructive, secrets → founder approval, always

## Files changed

<!-- Bullet list of the meaningful files and why each changed. -->

## Commands run

<!-- Build/test/verification commands executed, with outcomes. -->

## Verification result

<!-- What was verified and how (tests green, preview checked, prod logs, live probe). Paste evidence, not adjectives. -->

## Production/live actions?

<!-- yes/no. If yes: which actions, and note that merging does NOT authorize running them — each needs its own founder approval. -->

## Founder approval needed?

<!-- yes/no, per the risk level above. -->

## Secrets touched?

<!-- MUST be "no". No .env edits, no secrets printed or committed. If a secret was exposed anywhere, say so and flag rotation. -->

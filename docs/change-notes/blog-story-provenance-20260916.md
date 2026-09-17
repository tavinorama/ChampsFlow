# R05-a — a composite is never published as a documented case (2026-09-16)

Local branch `prep/r05-story-provenance`, base `7a64900`. Risk **LOW** (two scripts of the Monday auto-publish pipeline; no app code, no env). HELD until F2/F3.

## What was measured

Two auto-published articles narrate a named small business as a documented case — "The Small-Engine Shop ChatGPT Named, Then Almost Lost" (#597, 07/09) and "The Orchard ChatGPT Sent Customers to on the Wrong Day" (#619, 14/09) — sourced only by generic links about local search and Google Business (Codex, 14/09; not contested). The generator's prompt already says *"a real story, a real person… NEVER a number without a named source"*, and the ingest gate already requires ≥1 source URL, but nothing distinguished a real case from a composite, so a composite could read as reporting.

## What changes

1. **`scripts/blog-generate.py`** — `story` joins `REQUIRED_KEYS`; the prompt gains the *STORY PROVENANCE* rule: the central case is `real` only if a public URL documents that specific business/person and event (`story.source`, also listed in `sources`); otherwise it is `illustrative`, named so a reader cannot mistake it for a documented company, and the site labels it. The output contract adds `"story":{"kind","source"}`.
2. **`scripts/blog-ingest.mjs`** — the gate: `story` must be an object; `kind` ∈ {`real`, `illustrative`}; `real` without a URL is **rejected** (the Action fails loudly, nothing is written); `real` with a URL gets the case URL added to `sources` if missing; `illustrative` gets the label as the **first paragraph** of the published body: *"Illustrative example: the business and people in this story are a composite built from public patterns, not a documented case."* `BLOG_INGEST_DIR` lets the test run the real script against a temp copy of the site files.

## What this does NOT do

- Does not relabel or correct the two published articles — that is the founder's editorial call (item 12 of the list): add the label, cite the case, or unpublish.
- Does not gate the social pipeline (Postiz/LinkedIn "2.08 billion impressions" card) — a different generator; R05 there is a separate change.
- Does not verify that `story.source` actually documents the case; it makes the claim explicit and traceable, which is what a reviewer needs.

## Tests

`tests/unit/blog-story-provenance.test.ts` runs the real ingest script against a temp copy of `_content.ts`/`posts.ts`: missing story → rejected; real without URL → rejected; unknown kind → rejected; illustrative → published with the label first; real with URL → published unlabelled, URL in sources. Plus the generator contract (required key, rule text). `blog-generate-lessons-sync` (house lessons mirror) untouched.

## Rollback

Revert the branch; the next Monday article is accepted without `story` again.

## Proof owed after merge

The next Monday auto-publish (`blog-autopublish.yml`) either publishes with `story.kind` recorded and, if illustrative, the label visible at ozvor.com/blog/<slug>, or fails on the gate with the reason in the job log and Telegram.

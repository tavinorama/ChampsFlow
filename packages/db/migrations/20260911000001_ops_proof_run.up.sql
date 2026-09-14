-- ops.proof_run — one REAL AI-search measurement per day, the raw material of
-- the daily LinkedIn proof post (channel C, founder approval 2026-09-11).
--
-- WHY THIS EXISTS. The LinkedIn sphere publishes every day, but the posts are
-- CATEGORY posts: true statements about a market, with no number of our own
-- behind them. The hook the founder asked for is a measured one — "I asked
-- ChatGPT who to hire for roofing in Austin. Three names. None of them was the
-- shop with 4.9 stars and 300 reviews." A hook like that is only honest if the
-- number exists somewhere outside the model that wrote the sentence. This
-- table is that somewhere: the measurement lands here FIRST, by code, and the
-- post is allowed to carry only numbers that are already in this row.
--
-- SHAPE: one row per calendar day (proof_date is UNIQUE). That uniqueness is
-- not tidiness, it is the COST CAP: the job inserts before it spends, so a
-- retry, a double tick or a manual re-run cannot buy a second probe run. One
-- probe set per day is ~US$0.01-0.03 of engine spend (4-5 engines, 1 prompt),
-- i.e. under US$1/month, and the ledger row in api_spend carries op='li_proof'.
--
-- PII AND THE ANONYMITY SPLIT. The target is a real business that never asked
-- to be written about. The identifying columns (target_domain, target_name,
-- target_email) exist ONLY so the measurement is auditable and so the same
-- business is never measured twice; they are PUBLIC business data already held
-- in crm_contact. They are deliberately NOT part of what the post ever sees:
-- the code that renders the [__proof__] artifact reads segment, city, engine
-- counts and the public rating/review proxies, and nothing else. The house
-- rule "nunca nome de empresa sem consentimento" is therefore enforced by the
-- SHAPE of the read, not by asking a model to be careful.

CREATE TABLE IF NOT EXISTS ops.proof_run (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The cost cap. One proof per calendar day (UTC), enforced by the database
  -- rather than by a job that believes it only runs once.
  proof_date     DATE        NOT NULL UNIQUE,

  -- ---- what the post may talk about (anonymous by construction) ----------
  -- ICP segment label, e.g. 'roofing', 'hvac', 'dental'. Derived by code.
  segment        TEXT        NOT NULL,
  -- 'Austin, TX' — locality + region, derived by code from public sources.
  city           TEXT        NOT NULL,
  -- The exact buyer question we asked the engines, stored verbatim.
  prompt         TEXT        NOT NULL,
  -- Public "they are clearly good" proxies (Google rating / review count) when
  -- the prospect record carried them. NULL is honest and common.
  target_rating  NUMERIC(2,1),
  target_reviews INTEGER,

  -- ---- the measurement ---------------------------------------------------
  engines_total  INTEGER     NOT NULL,
  engines_live   INTEGER     NOT NULL,
  -- On how many engines the target was actually cited. 0 is the usual answer
  -- and the whole point of the post.
  cited_engines  INTEGER     NOT NULL,
  target_cited   BOOLEAN     NOT NULL,
  -- Per-engine detail: [{engine, live, cited, position}] — the evidence a
  -- human can re-read when a post is challenged.
  engines        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Who the engines DID name, when a conservative code extractor could count
  -- them confidently. NULL = not confidently countable (never a guess).
  cited_names    TEXT[],

  -- ---- identity (audit only, never rendered into a post) -----------------
  target_domain  TEXT        NOT NULL,
  target_name    TEXT,
  -- The crm_contact key, so a business is measured at most once, ever.
  target_email   TEXT,

  -- ---- cost --------------------------------------------------------------
  cost_cents     NUMERIC(10,4) NOT NULL DEFAULT 0,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "has this business already been a proof target?" runs on every selection.
CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_run_target_email
  ON ops.proof_run (lower(target_email)) WHERE target_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proof_run_date ON ops.proof_run (proof_date DESC);
-- The 7-day anti-repetition read ("do not do roofing/Austin twice this week").
CREATE INDEX IF NOT EXISTS idx_proof_run_pair ON ops.proof_run (segment, city, proof_date DESC);

-- Append + read for the runtime role. A measurement that can be edited after
-- the post quoted it is not evidence; UPDATE is deliberately not granted.
GRANT SELECT, INSERT ON ops.proof_run TO app_user;

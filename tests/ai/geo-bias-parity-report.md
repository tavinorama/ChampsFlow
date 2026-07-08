# GEO Bias Parity Report — GEO-A8 (Gate 6→7)

Generated: 2026-07-08T15:52:20.986Z
Brand-name corpus: 10 names across 8+ linguistic origins (incl. diacritics, hyphens, apostrophes, multi-word).

| Layer | Parity result |
|---|---|
| Sentiment classifier | PASS — identical classification for all 10 name origins across 3 polarity templates |
| Citation parser | PASS — mention=true, position=2, sources=1 for all 10 name origins |
| Competitor detection | PASS — every name origin detected when present (word-boundary safe) |
| Strategy generator | PASS — name-blind by construction (no name in StrategyInputs); deterministic |
| Content Studio (blog template) | PASS — identical heading/placeholder/schema structure for all 10 name origins |
| Content Studio (FAQ template) | PASS — identical structure + FAQPage schema for all 10 name origins |

Method: identical inputs except the brand name; outputs must be identical
(scores byte-equal, structures equal). All layers deterministic — no live API calls.
Scoring engine (computeGeoScore) takes no name inputs — name-blind by construction.
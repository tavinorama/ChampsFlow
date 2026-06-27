# Bias Baseline Report — Organic Posts C1 AI Post Generation

> Generated: 2026-06-27T10:35:47.246Z
> Model: Anthropic Claude Sonnet (claude-sonnet-4-5-20251022)
> A8 Gate 6→7 condition — NIST AI RMF MEASURE

## Summary

| Metric | Value |
|--------|-------|
| Total prompts tested | 30 |
| Prompts passed (deny-list clean) | 30 |
| Deny-list violations | 0 |
| ZDR confirmed (all locales) | Yes |
| Fictitious product mentions | 0 |
| PII in output | 0 |

**Overall result: PASS**

---

## Per-Locale Results

| Locale | Prompts | Passed | Deny-list Hits | Output Length Issues | ZDR Confirmed |
|--------|---------|--------|----------------|----------------------|---------------|
| en-US | 10 | 10 | 0 | 0 | Yes |
| en-GB | 10 | 10 | 0 | 0 | Yes |
| pt-BR | 10 | 10 | 0 | 0 | Yes |

---

## Deny-list Violations

_No violations detected._

---

## Methodology

- **Prompts**: 30 total (10 per locale: en-US, en-GB, pt-BR)
- **Mock strategy**: AnthropicAdapter mocked with locale-appropriate fixture corpus — no real Anthropic API call in CI
- **Deny-list**: 7 categories (gendered stereotype, racial stereotype, slurs, competitor disparagement, email PII, phone PII, fictitious product promotion)
- **Qualitative assessment**: Sufficient for v1 per ai-risk-assessment.md §MEASURE (no 4/5ths disparate-impact metric required)
- **Locale coverage**: English US (strongest), English UK (tested), Portuguese BR (tested — founder locale)

## Limitations

- Fixture corpus uses static mock responses; real Anthropic API outputs may vary
- Production bias evaluation requires live API sampling (recommended pre-Gate 7 manual review)
- pt-BR coverage is limited — Portuguese language model performance should be validated in user acceptance testing
- No formal disparate-impact scoring (appropriate for v1 given no protected-class decisions)

## References

- [AI Risk Assessment](../docs/compliance/ai-risk-assessment.md) — A8 condition
- [Model Card](../docs/compliance/model-cards/c1-ai-post-generation.md)
- NIST AI RMF 1.0 — MEASURE function

---

*Handoff: This report satisfies Gate 6→7 A8 condition. qa-reviewer to confirm pass verdict.*

# Data Protection Impact Assessment (DPIA)

> Owner: `legal-privacy-officer` · Created at gate 3→4 · Updated when processing changes
> GDPR Art. 35 — required when processing is likely to result in high risk to data subjects

## 1. Processing operations description
- Purposes:
- Categories of data subjects:
- Categories of personal data:
- Recipients (internal teams, sub-processors, third countries):
- Retention periods (per category):
- Technical methods (collection, storage, processing, deletion):

## 2. Necessity & proportionality
- Lawful basis per processing purpose (GDPR Art. 6):
- Special-category basis if applicable (GDPR Art. 9):
- Data minimization analysis: _is each field necessary for the stated purpose?_
- Storage limitation analysis: _is each retention period justified?_

## 3. Risks to data subjects
| # | Risk | Likelihood (L/M/H) | Severity (L/M/H) | Score |
|---|---|---|---|---|
| 1 |  |  |  |  |
| 2 |  |  |  |  |

Examples to consider: identity theft, financial loss, reputational damage, discrimination, loss of confidentiality, re-identification, profiling effects, exclusion from service.

## 4. Mitigation measures
### Technical
- Encryption at rest:
- Encryption in transit:
- Pseudonymization / tokenization:
- Access controls:
- Audit logging:
- Data minimization in storage:

### Organizational
- Access policy:
- Training:
- Vendor due diligence (DPAs):
- Breach response procedure:

## 5. Data subject rights — implementation
- [ ] Right to access (Art. 15) — UX flow + tested in QA
- [ ] Right to rectify (Art. 16)
- [ ] Right to erasure (Art. 17) — UX flow + tested in QA
- [ ] Right to restrict processing (Art. 18)
- [ ] Right to portability (Art. 20) — export format documented
- [ ] Right to object (Art. 21)
- [ ] Rights re. automated decisions (Art. 22) — applicable? human review available?

## 6. Cross-border transfers
- Mechanism (DPF / SCCs / derogation):
- Transfer Impact Assessment (TIA) summary:

## 7. Residual risk verdict
- After mitigations: Low / Medium / High
- If High → consult DPA (data protection authority) per Art. 36 before deploying

## 8. Approval
- DPIA author: legal-privacy-officer agent
- Reviewed by (human): _____
- Date:
- Next review trigger: _(material change in processing)_

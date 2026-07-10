# Breach Notification Runbook

> Owner: Founder (acts as DPO for v1; formal Encarregado — LGPD Art. 41 — appointment pending) · Created: 2026-05-11 · Updated: 2026-07-10 (issue #213 — entity/brand refresh to Ozvor / Brazil-LGPD)

## TL;DR

LGPD Art. 48 / ANPD Resolution CD/ANPD 02/2022 (home jurisdiction — Brazil): notify **ANPD within 2 business days** of becoming aware, for significant incidents (see `docs/compliance/ropa.md` §breach). GDPR Art. 33: notify the competent EU supervisory authority within 72 hours. CCPA and US state laws: notify affected individuals without unreasonable delay. Named contact: `dpo@ozvor.com`.

## Is It a Breach? Decision Tree

1. Was personal data (email, OAuth tokens, IP, post content, session tokens) accessed, disclosed, altered, or destroyed without authorization? If no: not a breach; document and close.
2. Could it result in risk to individuals (identity theft, unauthorized posting, financial loss)? If no risk: document in breach log; no regulatory notification required.
3. Which users are affected?
   - Brazilian users / home-jurisdiction incidents: LGPD Art. 48 notification to **ANPD within 2 business days** for significant incidents.
   - EU users: GDPR Art. 33 notification to supervisory authority within 72 hours.
   - EU users with high individual risk: GDPR Art. 34 direct user notification also required.
   - California users: CCPA notification within 30 days.
   - Texas users: TDPSA notification within 60 days.

## Response Steps

1. Contain (first 2 h): isolate affected system; revoke compromised tokens; preserve logs.
2. Assess scope (24 h): data categories, user count, region, breach vector. Document in `docs/learning/postmortems/breach-YYYY-MM-DD.md`.
3. Authority notification: **ANPD (LGPD Art. 48, 2 business days)** via the ANPD incident-reporting channel — the controller is Brazil-established (Ozvor, MEI, CNPJ 67.609.444/0001-08). For EU data subjects, GDPR Art. 33 (72 h) to the competent supervisory authority (as a non-EU controller, coordinate via the EU Art. 27 representative once appointed). If information is incomplete, submit initial notification and follow up.
4. User notification (Art. 34 / US state laws): send individual notification using the template below.
5. Post-mortem within 5 business days. Update threat model.

## Authority Notification Template (GDPR Art. 33)

```
Data Breach Notification — Ozvor (CNPJ 67.609.444/0001-08)  [DATE]
Notifier: [Name], dpo@ozvor.com
Nature of breach: [description]
Data categories: [e.g., email addresses, OAuth tokens]
Data subjects affected (approx): [number]
Likely consequences: [description]
Measures taken: [containment and remediation]
Cross-border: [yes/no; affected member states]
```

## User Notification Template (Art. 34 / CCPA)

```
Subject: Security notice — your Ozvor account

Dear [Name],
A security incident on [date] may have affected your account.
What happened: [brief description]
Data involved: [categories]
What we did: [containment steps]
What you should do: [e.g., revoke and reconnect social accounts]
Questions: dpo@ozvor.com
— [Founder name], Ozvor
```

## Internal Breach Log (append-only)

| Date | Nature | Data | Users | Region | Authority notified | Users notified | Closed |
|---|---|---|---|---|---|---|---|
| (none yet) | | | | | | | |

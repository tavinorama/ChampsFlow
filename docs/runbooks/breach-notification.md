# Breach Notification Runbook

> Owner: Founder (acts as DPO for v1) · Created: 2026-05-11

## TL;DR

GDPR Art. 33: notify supervisory authority within 72 hours. CCPA and US state laws: notify affected individuals without unreasonable delay. Named contact: `privacy@organicposts.ai`.

## Is It a Breach? Decision Tree

1. Was personal data (email, OAuth tokens, IP, post content, session tokens) accessed, disclosed, altered, or destroyed without authorization? If no: not a breach; document and close.
2. Could it result in risk to individuals (identity theft, unauthorized posting, financial loss)? If no risk: document in breach log; no regulatory notification required.
3. Which users are affected?
   - EU users: GDPR Art. 33 notification to supervisory authority within 72 hours.
   - EU users with high individual risk: GDPR Art. 34 direct user notification also required.
   - California users: CCPA notification within 30 days.
   - Texas users: TDPSA notification within 60 days.

## Response Steps

1. Contain (first 2 h): isolate affected system; revoke compromised tokens; preserve logs.
2. Assess scope (24 h): data categories, user count, region, breach vector. Document in `docs/learning/postmortems/breach-YYYY-MM-DD.md`.
3. GDPR Art. 33 notification (72 h): file via supervisory authority portal (Ireland DPC at `https://www.dataprotection.ie/en/organisations/data-breach-notifications` if registered in Ireland). If information is incomplete, submit initial notification and follow up.
4. User notification (Art. 34 / US state laws): send individual notification using the template below.
5. Post-mortem within 5 business days. Update threat model.

## Authority Notification Template (GDPR Art. 33)

```
Data Breach Notification — Organic Posts  [DATE]
Notifier: [Name], privacy@organicposts.ai
Nature of breach: [description]
Data categories: [e.g., email addresses, OAuth tokens]
Data subjects affected (approx): [number]
Likely consequences: [description]
Measures taken: [containment and remediation]
Cross-border: [yes/no; affected member states]
```

## User Notification Template (Art. 34 / CCPA)

```
Subject: Security notice — your Organic Posts account

Dear [Name],
A security incident on [date] may have affected your account.
What happened: [brief description]
Data involved: [categories]
What we did: [containment steps]
What you should do: [e.g., revoke and reconnect social accounts]
Questions: privacy@organicposts.ai
— [Founder name], Organic Posts
```

## Internal Breach Log (append-only)

| Date | Nature | Data | Users | Region | Authority notified | Users notified | Closed |
|---|---|---|---|---|---|---|---|
| (none yet) | | | | | | | |

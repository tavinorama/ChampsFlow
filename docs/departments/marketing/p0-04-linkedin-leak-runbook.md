# P0-04 — internal notes leaked into a public LinkedIn post

**TL;DR.** A published LinkedIn post carries its own drafting scaffolding:
a "Claim-basis (nota interna)" line, a reference to the research file, an
`Owner:` field, and the production instruction "link no 1º comentário".
The code half is done — the same content can no longer be approved or
published — but **the live post must be corrected by hand by the founder**.
No code in this repo can or should reach into the live LinkedIn feed to edit
or delete it. Ten minutes of manual work, steps below.

---

## Why this is a manual task, deliberately

Editing or deleting a published post is an irreversible action on a public
account. The audit asked for the incident to be corrected and for recurrence to
be prevented; only the second half belongs in code. Automating the first half
would mean giving a background job permission to delete public content, which is
a much larger and worse risk than the leak it would be cleaning up.

So: the guard is shipped, the post is yours.

---

## What the founder needs to do

1. **Find the post.** LinkedIn → the Ozvor company page (and the founder
   profile, if it was cross-posted) → Posts / Activity. Look for the post that
   contains any of: `Claim-basis`, `nota interna`, `Owner:`, a `.md` filename,
   or `link no 1º comentário`.

2. **Prefer edit over delete.** LinkedIn's "Edit post" keeps the URL, the
   reactions and the comments. Deleting and reposting throws away whatever
   reach the post earned and looks like a retraction of the argument rather than
   a tidy-up of a formatting slip. Remove only the scaffolding lines; leave the
   actual argument exactly as it is.

3. **Lines to delete**, in full, including the label:
   - the `Claim-basis (nota interna): …` line and the research-file path,
   - the `Owner: …` line,
   - the `Link no 1º comentário` instruction — **and then actually put the link
     in the first comment**, which is what the instruction was reminding
     somebody to do. Check the comment exists; the instruction leaking usually
     means the step itself was skipped.

4. **Check the neighbours.** The markers come from the drafting template, so if
   one post carried them, others from the same batch may too. Sweep the last
   ~10 posts on every connected channel — LinkedIn, X, Instagram, Reddit — for
   the same five strings. Same edit-don't-delete rule.

5. **Say nothing publicly.** No correction notice, no apology post. The content
   of the argument did not change; only the leftover formatting did. Drawing
   attention to it makes a copy-paste slip into a story.

6. **Report back** with the post URL and what was removed, so this file can be
   closed out.

---

## What the code now prevents

Both doors, using the same shared check
(`packages/shared/src/editorial-leak.ts`), so they cannot drift apart:

| Door | Behaviour |
|---|---|
| `POST /api/drafts/:id/approve` | 422 `EDITORIAL_LEAK`. The response lists every offending excerpt **and** the full final text, so the approver sees exactly what would have gone public. The draft is not written to `approved`. |
| Worker `publish` job | Permanent failure `content_rejected` before the platform adapter is called. Not retryable — retrying leaked text only leaks it later. |

The approve endpoint also accepts an optional `approved_text`: when the caller
sends the text it previewed and that text no longer matches the stored draft,
approval is refused with 409 `APPROVAL_TEXT_STALE` rather than silently applied
to copy nobody read.

**Markers blocked:** `claim-basis`, `nota interna`, `internal only`,
`Owner:` at the start of a line, `TODO` (all-caps, as a word), `PR #<digits>`,
and "link no 1º comentário" / "link in the first comment".

**Deliberately NOT blocked**, to keep the guard credible: lower-case `todo`
(an ordinary Portuguese/Spanish word) and `owner:` in the middle of a sentence.
A validator that cries wolf is a validator someone switches off.

---

## Not verified

- Nobody from this workstream opened LinkedIn. The post has **not** been
  inspected, edited, or confirmed to still be live — the incident is taken from
  the audit report (§11) as reported.
- The sweep in step 4 has not been done.

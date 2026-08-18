#!/usr/bin/env python3
"""
blog-generate.py — ask the Hermes VPS to write the weekly article as strict
JSON, ROBUSTLY, and never fail in silence.

Why this file exists (17/08/2026): the Monday blog-autopublish had FAILED every
single time it ever ran (04/08 x4 manual, 10/08, 17/08) and nobody was told.
The last two failures were "no JSON object found in the model output": Hermes
answered ok:true in ~30s with a short non-JSON reply (a refusal / clarifying
question / preamble), the workflow discarded the output before logging it, and
died. Three defects, all fixed here:
  1. the model's output was thrown away  -> saved to article.raw.txt + logged
     (first 600 chars) so the next failure diagnoses itself;
  2. one attempt, one engine              -> up to 3 attempts: claude, then a
     "return ONLY the JSON" repair prompt, then engine codex (the Hermes
     fallback chain exists, the workflow just never asked for it);
  3. brittle parse                        -> accepts ```json fences, text
     before/after, and validates the keys before declaring success.
Exit code 1 on failure, with a one-line reason on stderr — the workflow's
failure step turns that into a Telegram alarm.

Env: HERMES_TASK_TOKEN (required), THEME (optional), HERMES_URL (default
https://hermes.ozvor.com). Writes article.json on success.
"""
import json
import os
import re
import sys
import time
import urllib.request

HERMES = os.environ.get("HERMES_URL", "https://hermes.ozvor.com").rstrip("/")
TOKEN = re.sub(r"^\s*[Bb]earer\s+", "", os.environ.get("HERMES_TASK_TOKEN", "")).strip()
THEME = os.environ.get("THEME", "").strip()
if not TOKEN:
    sys.exit("HERMES_TASK_TOKEN missing")

REQUIRED_KEYS = ["slug", "title", "dek", "category", "excerpt", "readTime", "keywords", "takeaways", "body_markdown", "sources"]

BASE_PROMPT = (
    "You are the staff writer for Ozvor, a GEO / AI-search visibility platform for small businesses. "
    "Write ONE complete, publishable blog article about generative-engine optimization (how ChatGPT, "
    "Perplexity, Gemini and Google AI Overviews decide which businesses to name), grounded in something "
    "real and recent. Center it on a concrete small-business owner and a specific, true development. "
    "Human, warm, specific. British-neutral English.\n"
    "HARD RULES: never use an em-dash or en-dash anywhere; every statistic must cite a named, dated, "
    "public source with a real URL; no fabricated numbers; end with one soft CTA to ozvor.com.\n"
    "OUTPUT CONTRACT (this is a machine pipeline, not a chat): respond with the JSON object ONLY. "
    "No greeting, no explanation, no questions back, no markdown fence. If you are unsure about a "
    "detail, choose a safe, sourced example rather than asking. Start your reply with '{' and end "
    "with '}'.\n"
    "Keys, exactly: {\"slug\":\"kebab-case-6-to-80-chars\",\"title\":\"...\",\"dek\":\"one-sentence sub-headline\","
    "\"category\":\"one of: GEO 101, GEO Playbook, How AI Works, Local & SMB, Measurement, Playbook, Research, "
    "Reviews & Trust, Strategy, Technical GEO\",\"excerpt\":\"one-sentence index blurb\",\"readTime\":\"N min read\","
    "\"keywords\":[\"3 to 6 terms\"],\"takeaways\":[\"2 to 5 short takeaways\"],\"body_markdown\":\"the full article "
    "(at least 700 words); paragraphs separated by blank lines; use '## ' for at least one section heading\","
    "\"sources\":[\"Name, quoted title (date), https://url\"]}"
)
if THEME:
    BASE_PROMPT = f"Theme to cover: {THEME}. " + BASE_PROMPT

REPAIR_PROMPT = (
    "Your previous reply was not the JSON object the pipeline needs. Reply again with ONLY the JSON "
    "object described below, starting with '{' and ending with '}', nothing else. "
    + BASE_PROMPT
)


def call_task(prompt: str, engine: str, timeout_s: int = 600) -> dict:
    body = json.dumps({"engine": engine, "timeoutMs": (timeout_s - 60) * 1000, "prompt": prompt}).encode()
    req = urllib.request.Request(
        f"{HERMES}/task",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as r:
        return json.loads(r.read().decode())


def extract_json(text: str) -> dict | None:
    """Accept fenced or bare JSON, text before/after; return the first object with the required keys."""
    if not text:
        return None
    candidates = []
    fenced = re.findall(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    candidates.extend(fenced)
    # Greedy outer object as last resort.
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        candidates.append(m.group(0))
    for c in candidates:
        try:
            obj = json.loads(c)
        except Exception:
            continue
        if isinstance(obj, dict) and all(k in obj for k in REQUIRED_KEYS):
            return obj
    return None


attempts = [
    ("claude", BASE_PROMPT),
    ("claude", REPAIR_PROMPT),
    ("codex", BASE_PROMPT),
]
last_reason = "no attempts"
for i, (engine, prompt) in enumerate(attempts, 1):
    t0 = time.time()
    print(f"[attempt {i}/{len(attempts)}] engine={engine} calling {HERMES}/task ...", flush=True)
    try:
        r = call_task(prompt, engine)
    except Exception as e:  # network / timeout / non-2xx
        last_reason = f"attempt {i} ({engine}): transport error {type(e).__name__}: {str(e)[:200]}"
        print(last_reason, file=sys.stderr, flush=True)
        continue
    dt = round(time.time() - t0)
    out = (r.get("output") or "") if isinstance(r, dict) else ""
    # NEVER discard the model output again: keep it for the post-mortem.
    with open(f"article.raw.{i}.txt", "w", encoding="utf-8") as fh:
        fh.write(out if out else json.dumps(r)[:5000])
    print(f"[attempt {i}] ok={r.get('ok') if isinstance(r, dict) else '?'} engine_used={r.get('engine_used') if isinstance(r, dict) else '?'} {dt}s, output {len(out)} chars", flush=True)
    print("[attempt %d] output head: %s" % (i, out[:600].replace("\n", " ")), flush=True)
    if not (isinstance(r, dict) and r.get("ok")):
        last_reason = f"attempt {i} ({engine}): VPS task failed: {str(r.get('error') or r.get('stderr') or r)[:300] if isinstance(r, dict) else r}"
        print(last_reason, file=sys.stderr, flush=True)
        continue
    art = extract_json(out)
    if art is None:
        last_reason = f"attempt {i} ({engine}): no valid article JSON in output ({len(out)} chars, {dt}s). Head: {out[:200]!r}"
        print(last_reason, file=sys.stderr, flush=True)
        continue
    body_len = len(str(art.get("body_markdown", "")))
    if body_len < 2500:  # ~450 words; a real article is longer
        last_reason = f"attempt {i} ({engine}): body too short ({body_len} chars) — likely truncated/placeholder"
        print(last_reason, file=sys.stderr, flush=True)
        continue
    with open("article.json", "w", encoding="utf-8") as fh:
        json.dump(art, fh, ensure_ascii=False, indent=2)
    print(f"article slug: {art.get('slug')} (engine {r.get('engine_used') or engine}, {dt}s, body {body_len} chars)")
    sys.exit(0)

sys.exit(f"BLOG GENERATION FAILED after {len(attempts)} attempts. Last: {last_reason}")

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

# ---------------------------------------------------------------------------
# Anti-repetição REAL (0.8, founder 01/09: "publicações genéricas e com um
# padrão repetido demais" — vale para TODO pipeline que cria conteúdo, e o
# blog de segunda é um deles). A agregação é CÓDIGO: os títulos+deks dos
# últimos posts são lidos DO FONTE do site (o workflow faz checkout completo
# antes de rodar este script), nunca pedidos ao modelo. O que é recuperável
# por código aqui: título, dek/excerpt e data de cada post publicado — o
# corpo não é injetado (o padrão repetido vive no ângulo/gancho, e 8 corpos
# estourariam o prompt). Se os arquivos não estiverem legíveis (ex.: rodar o
# script fora do checkout), seguimos SEM a lista e dizemos isso no log —
# honesto, nunca inventado.
# ---------------------------------------------------------------------------

RECENT_POSTS_LIMIT = 8
BLOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "apps", "web", "src", "app", "(marketing)", "blog")

_STR = r'"((?:[^"\\]|\\.)*)"'


def _parse_entries(src: str, title_key: str, dek_key: str, date_key: str):
    """Walk key: "value" pairs in source order; a new title starts a record."""
    out = []
    current = None
    for m in re.finditer(r"\b(title|dek|excerpt|datePublished|publishedAt):\s*" + _STR, src):
        key, raw = m.group(1), m.group(2)
        val = raw.encode().decode("unicode_escape") if "\\" in raw else raw
        if key == title_key:
            current = {"title": val, "dek": "", "date": ""}
            out.append(current)
        elif current is not None and key == dek_key and not current["dek"]:
            current["dek"] = val
        elif current is not None and key == date_key and not current["date"]:
            current["date"] = val
    return out


def recent_posts(limit: int = RECENT_POSTS_LIMIT):
    """Last published posts (title+dek+date), newest first, read by CODE."""
    entries = []
    for fname, dek_key, date_key in (("posts.ts", "excerpt", "publishedAt"), ("_content.ts", "dek", "datePublished")):
        try:
            with open(os.path.join(BLOG_DIR, fname), encoding="utf-8") as fh:
                entries.extend(_parse_entries(fh.read(), "title", dek_key, date_key))
        except OSError as e:
            print(f"[recent-posts] {fname} unreadable ({e}) — following without it", file=sys.stderr, flush=True)
    seen, dedup = set(), []
    for e in entries:
        k = e["title"].strip().lower()
        if e["title"] and k not in seen:
            seen.add(k)
            dedup.append(e)
    dedup.sort(key=lambda e: e["date"], reverse=True)
    return dedup[:limit]


def anti_generic_block() -> str:
    posts = recent_posts()
    if not posts:
        print("[recent-posts] no posts recoverable from the checkout — anti-repetition list unavailable, generic-rule still applies", flush=True)
        recent = "(recent-post list unavailable in this run — still: do not reuse the angles this blog always uses.)\n"
    else:
        print(f"[recent-posts] injecting {len(posts)} recent titles+deks into the prompt", flush=True)
        recent = "RECENTLY PUBLISHED ON THIS BLOG (newest first — do NOT repeat their angle, hook or structure):\n" + "".join(
            f"- {p['date'] or '????-??-??'} \"{p['title']}\" — {p['dek']}\n" for p in posts
        )
    return (
        recent
        + "ANTI-GENERIC RULES (hard): pick an angle, opening scene and structure DELIBERATELY different "
        "from every item above; no opener that could fit any business ('in today's digital world', "
        "'AI is changing everything'); every claim names something concrete (a real niche, a sourced "
        "number, a specific scenario); include the extra JSON key \"angle_note\" (one sentence: the "
        "chosen angle and why it differs from the recent list).\n"
    )

# ---------------------------------------------------------------------------
# 10.C.6 — ESPELHO de CONTENT_LESSONS (apps/api/src/lib/graph-prompts.ts).
# O blog-generate era a 2ª implementação das regras da casa e derivava
# ("British English", sem regra 15-17/≤12 palavras). Python não importa TS,
# então as lições são DUPLICADAS aqui linha a linha — e o teste
# tests/unit/blog-generate-lessons-sync.test.ts QUEBRA se os dois arquivos
# divergirem. Para mudar uma lição: editar graph-prompts.ts primeiro, copiar
# aqui depois.
# ---------------------------------------------------------------------------
CONTENT_LESSONS = "\n".join([
    "LICOES DA CASA (memoria institucional de conteudo — regua de VETO, nao sugestao):",
    "- Nunca repetir tema, gancho ou b-roll recente: se [memory] ja mostra, muda ou veta.",
    "- X: cada tweet tem <=280 caracteres e o pipe publica UM post por vez — thread vira tweet unico; o tweet 1 tem que se sustentar sozinho.",
    "- Canal que exige midia NAO recebe texto puro: TikTok/YouTube (so video) vao como report ao founder; Instagram publica card brandado + legenda — o publish leva a imagem por construcao (1.6), e se o card nao renderiza, nada sai.",
    "- LinkedIn: no maximo 2 posts/dia (valvula de cadencia) — excedente ADIA para o dia seguinte, nao empilha no feed.",
    "- Copy nivel 15-17 anos: frases <=12 palavras, CTA em 1a pessoa, sem travessao.",
    "- Sonho honesto: historia, personagem, gente real — e NUNCA inventar dado; numero so com fonte.",
    "- Conteudo publico e English-first, sem excecao (relatorio interno ao founder segue em PT).",
])

BASE_PROMPT = (
    "You are the staff writer for Ozvor, a GEO / AI-search visibility platform for small businesses. "
    "Write ONE complete, publishable blog article about generative-engine optimization (how ChatGPT, "
    "Perplexity, Gemini and Google AI Overviews decide which businesses to name), grounded in something "
    "real and recent. Center it on a concrete small-business owner and a specific, true development. "
    "Human, warm, specific. US English (the house rule is English-first, US spelling).\n"
    "HOUSE COPY RULES (hard): write for a 15-17 year old reading level; keep sentences at 12 words or "
    "fewer wherever prose allows; honest dream: a real story, a real person, a real pain — and NEVER a "
    "number without a named source.\n"
    + CONTENT_LESSONS + "\n"
    "HARD RULES: never use an em-dash or en-dash anywhere; every statistic must cite a named, dated, "
    "public source with a real URL; no fabricated numbers; end with one soft CTA to ozvor.com.\n"
    "GEO RULES (we are a GEO company; our own posts must be citable by AI engines): phrase at least "
    "two '## ' section headings as the exact question a small-business owner would ask (e.g. "
    "'## Why isn't my business in ChatGPT's answers?'); open each of those sections with a direct, "
    "self-contained answer in the first 40-60 words (quotable without the rest of the page); include "
    "one self-contained answer block of roughly 134-167 words early in the article (within the first "
    "third) that fully answers the core question on its own; name the source inline next to every "
    "number (not only in the sources list).\n"
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
# 0.8: a lista real do que já saiu + a regra anti-genérico entram ANTES do
# contrato de saída — lidas por código, nunca lembradas pelo modelo.
BASE_PROMPT = anti_generic_block() + BASE_PROMPT
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
    # 21/08: claude E codex cairam juntos por 26h (sessao OAuth expirada na
    # VPS). Regra da casa: kimi substitui claude E codex — sem esta 4a
    # tentativa, um apagao duplo deixaria a segunda-feira sem blog.
    ("kimi", BASE_PROMPT),
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

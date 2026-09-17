#!/usr/bin/env python3
"""
campaigns_v4.py — the two cold campaigns of 17/09 (AI Geo Search, AI Audit
Stack): copy validation, SmartLead payloads with A/B variants, and the
per-lead personalization (trade, city, the buyer's own question).

WHY A FILE AND NOT INLINE PYTHON IN THE WORKFLOW. The founder rewrote this copy
three times in one afternoon. The copy lives in
docs/departments/sales/campaigns-v4.json; a new revision is a text edit, the
rules below run on it in CI, and the workflows stay thin.

WHAT NEVER HAPPENS HERE
  - no campaign is ever STARTED (a campaign found active is PAUSED and named);
  - nothing is written to SmartLead without --confirm (dry-run is the default);
  - no e-mail address, person name or phone is printed — aggregates only;
  - a lead that cannot be personalized (no recognizable trade, no city, no
    first name) is NOT loaded: an empty merge field is a hole in e-mail 1.

Commands:
  validate                      check the copy file against the house rules
  render --segment roofing      print one fully merged sample sequence
  personalize                   stdin: JSON list of leads -> custom fields / reasons
  create  [--confirm]           create/refresh the two DRAFTED campaigns
  load    [--confirm]           move eligible untouched leads into them
  prospect --trade T --limit N  SmartProspect: free search; --confirm SPENDS up to N credits
Stdlib only. SMARTLEAD key: env SL_KEY.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
COPY_PATH = os.path.join(HERE, "..", "..", "docs", "departments", "sales", "campaigns-v4.json")

BASE = "https://server.smartlead.ai/api/v1"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh) OzvorOps/1.0", "Accept": "application/json"}

LINK_RE = re.compile(r"https?://|www\.|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|ai|co|us|dev|app)\b", re.I)
VAR_RE = re.compile(r"\{\{\s*([a-z_0-9]+)\s*\}\}")
WORD_RE = re.compile(r"[A-Za-z0-9'&$]+")

# SmartLead's own lead fields + the custom fields this script writes.
NATIVE_VARS = {"first_name", "company_name"}
CUSTOM_VARS = {"city", "trade", "a_trade", "buyer_question", "job", "pain_task", "lost_hour"}
# `campaign` is resolved by this script when the payload is built (never reaches SmartLead).
BUILD_VARS = {"campaign"}
PROOF_VARS = {"ai_engine", "query", "competitor_1", "competitor_2", "report_url"}

SCHEDULE = {"timezone": "America/New_York", "days_of_the_week": [1, 2, 3, 4, 5],
            "start_hour": "09:00", "end_hour": "18:00", "min_time_btw_emails": 8,
            "max_new_leads_per_day": 80, "schedule_start_time": None}
SETTINGS = {"track_settings": ["DONT_TRACK_EMAIL_OPEN", "DONT_TRACK_LINK_CLICK"],
            "stop_lead_settings": "REPLY_TO_AN_EMAIL", "send_as_plain_text": True,
            "follow_up_percentage": 100, "enable_ai_esp_matching": True}

# Worst realistic values: the rules must hold when a company has a six-word name.
WORST = {"first_name": "Christopher", "company_name": "Hawk Plumbing Heating & Air Conditioning",
         "city": "Oklahoma City", "campaign": "ai-geo-search-2026-09"}


def load_copy(path: str = COPY_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def out(d: dict) -> None:
    print("RESULTADO_OZVOR" + json.dumps(d, ensure_ascii=False))


# --------------------------------------------------------------------------
# 1. Copy rules
# --------------------------------------------------------------------------

def merge(text: str, values: dict) -> str:
    return VAR_RE.sub(lambda m: str(values.get(m.group(1), m.group(0))), text)


def segment_values(copy: dict, segment: str, base: dict) -> dict:
    seg = copy["segments"][segment]
    v = dict(base)
    v.update(seg)
    v["buyer_question"] = seg["buyer_question"].replace("{city}", v["city"])
    return v


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.?!])\s+|\n+", text) if s.strip()]


def validate_copy(copy: dict) -> list[str]:
    """Every rule the house set for cold e-mail, checked on the merged text."""
    errors: list[str] = []
    lo, hi = copy["rules"]["email1_words"]
    max_sentence = copy["rules"]["max_sentence_words"]
    footer = copy["footer"]
    if "reply STOP" not in footer:
        errors.append("footer lost the literal opt-out line")
    segments = copy["segments"]
    for name, seg in segments.items():
        for field in ("trade", "a_trade", "buyer_question", "job", "pain_task", "lost_hour"):
            if not str(seg.get(field, "")).strip():
                errors.append(f"segment {name}: field {field} is empty")
        if "{city}" not in seg.get("buyer_question", ""):
            errors.append(f"segment {name}: buyer_question has no {{city}}")
        if LINK_RE.search(" ".join(str(x) for x in seg.values())):
            errors.append(f"segment {name}: a field looks like a link/domain")
    for key, camp in copy["campaigns"].items():
        if len(camp["steps"]) != 4:
            errors.append(f"{key}: expected 4 touches, got {len(camp['steps'])}")
        for ix, step in enumerate(camp["steps"], start=1):
            labels = [v["label"] for v in step["variants"]]
            if ix <= 2 and labels != ["A", "B"]:
                errors.append(f"{key} step {ix}: touches 1 and 2 carry variants A and B, got {labels}")
            for var in step["variants"]:
                vid = var["id"]
                raw = var["subject"] + "\n" + "\n".join(var["body"])
                used = set(VAR_RE.findall(raw))
                unknown = used - NATIVE_VARS - CUSTOM_VARS - BUILD_VARS
                if unknown:
                    errors.append(f"{vid}: unknown merge field(s) {sorted(unknown)}")
                if "—" in raw or "–" in raw:
                    errors.append(f"{vid}: em/en dash (house rule: none)")
                if footer in raw:
                    errors.append(f"{vid}: footer is appended by code, not written in the body")
                for seg_name in segments:
                    vals = segment_values(copy, seg_name, WORST)
                    body = merge("\n".join(var["body"]), vals)
                    subject = merge(var["subject"], vals)
                    if VAR_RE.search(body) or VAR_RE.search(subject):
                        errors.append(f"{vid}/{seg_name}: unresolved merge field after merge")
                    no_urls = re.sub(r"https?://\S+", "", body)
                    no_quote = no_urls.replace('"' + vals["buyer_question"] + '"', "")
                    if ix == 1:
                        if LINK_RE.search(body) or LINK_RE.search(subject):
                            errors.append(f"{vid}/{seg_name}: link or domain in e-mail 1 (rule 27/08)")
                        words = len(WORD_RE.findall(body))
                        if not lo <= words <= hi:
                            errors.append(f"{vid}/{seg_name}: e-mail 1 has {words} words (rule {lo}-{hi})")
                        if no_quote.count("?") != copy["rules"]["email1_questions"]:
                            errors.append(f"{vid}/{seg_name}: e-mail 1 has {no_quote.count('?')} questions of its own (rule 1)")
                    else:
                        links = re.findall(r"https?://\S+", body)
                        for link in links:
                            if "ozvor.com" in link and "?from=" not in link:
                                errors.append(f"{vid}: ozvor.com link without ?from=")
                    long = [s for s in _sentences(no_quote) if len(WORD_RE.findall(s)) > max_sentence]
                    if long:
                        errors.append(f"{vid}/{seg_name}: sentence over {max_sentence} words: {long[0][:70]}")
    # de-duplicate the per-segment repeats of one defect
    seen, unique = set(), []
    for e in errors:
        k = re.sub(r"/[a-z/ ]+:", ":", e)
        if k not in seen:
            seen.add(k)
            unique.append(e)
    return unique


# --------------------------------------------------------------------------
# 2. SmartLead payloads
# --------------------------------------------------------------------------

def _html(lines: list[str], campaign_name: str, footer: str) -> str:
    body = "<br>".join(merge(line, {"campaign": campaign_name}).replace("→", "-&gt;") for line in lines)
    return body + "<br><br>%signature%<br><br>" + footer


def build_sequences(copy: dict, key: str, campaign_name: str) -> list[dict]:
    seqs = []
    for ix, step in enumerate(copy["campaigns"][key]["steps"], start=1):
        variants = step["variants"]
        entry: dict = {"seq_number": ix, "seq_delay_details": {"delay_in_days": step["delay_in_days"]}}
        if len(variants) == 1:
            entry["subject"] = variants[0]["subject"]
            entry["email_body"] = _html(variants[0]["body"], campaign_name, copy["footer"])
        else:
            share = round(100 / len(variants))
            entry["variant_distribution_type"] = "MANUAL_EQUAL"
            entry["seq_variants"] = [
                {"subject": v["subject"], "email_body": _html(v["body"], campaign_name, copy["footer"]),
                 "variant_label": v["label"], "variant_distribution_percentage": share}
                for v in variants]
        seqs.append(entry)
    return seqs


# --------------------------------------------------------------------------
# 3. Personalization: trade + city from what the lead record already holds
# --------------------------------------------------------------------------

SEGMENT_RULES = [
    ("ortho", r"orthodont|\bortho\b|braces|invisalign"),
    ("med spa", r"med\s?spa|medspa|aesthetic|botox|laser\s?(clinic|center)|skin\s?(clinic|studio)"),
    ("law firm", r"\blaw\b|law\s?(firm|office|group)|attorney|lawyer|\blegal\b|litigat"),
    ("dental", r"dental|dentist|\bdds\b|smile\s?(center|studio)|endodont|periodont"),
    ("roofing", r"roof(ing|er|s)?\b"),
    ("hvac", r"\bhvac\b|heating|air\s?condition|furnace|cooling"),
    ("plumbing", r"plumb(ing|er|ers)?\b|drain|septic|rooter|water\s?heater"),
    ("remodeling", r"remodel|renovation|kitchen\s?(and|&)?\s?bath|custom\s?home|design\s?/?\s?build"),
    ("accounting", r"accounting|accountant|\bcpa\b|bookkeep|tax\s?(service|group|pro)"),
    ("auto body", r"auto\s?body|collision|body\s?shop|auto\s?(repair|care|service)"),
    ("real estate", r"real\s?estate|realty|realtor"),
    ("electrical", r"electric(al|ian)?\b"),
    ("landscaping", r"landscap|lawn\s?care|tree\s?service|irrigation|hardscape"),
    ("cleaning", r"clean(ing|ers)?\b|janitor|maid\b"),
    ("pest", r"pest\b|exterminat|termite"),
    ("chiro/pt", r"chiropract|physical\s?therapy"),
    ("vet", r"veterinar|animal\s?hospital"),
    ("salon", r"salon|barber|hair\s?studio|nail\s?(bar|salon)"),
    ("insurance", r"insurance"),
    ("moving", r"mov(ers|ing)\b|relocation|hauling"),
    ("fitness", r"fitness|\bgym\b|pilates|crossfit|yoga\b"),
    ("garage/doors", r"garage\s?door"),
    ("pool", r"\bpools?\b"),
    ("painting", r"paint(ing|ers?)\b"),
    ("concrete/paving", r"concrete|paving|asphalt"),
    ("flooring", r"floor(ing|s)?\b"),
    ("fencing", r"fenc(e|es|ing)\b"),
    ("construction", r"general\s?contract|construction|builders?\b"),
    ("it services", r"\bit\s(services?|support|solutions?)|managed\s?service|cyber|network(s|ing)?\b|computer"),
    ("agency/saas", r"agency|marketing|\bseo\b|digital|advertis"),
    ("design/media", r"design|media|creative|brand(ing)?\b|studios?\b|photo|video|print(ing)?\b|graphics"),
]
SEGMENT_RULES = [(n, re.compile(p, re.I)) for n, p in SEGMENT_RULES]

EXCLUDE = re.compile(r"hotel|motel|resort|hospital|health\s?system|university|college|school\s?district|church|"
                     r"city\s?of\s|county\s?of\s|\bgov\b", re.I)
FRANCHISE = re.compile(r"servpro|roto[-\s]?rooter|mr\.?\s?rooter|one\s?hour\s?heating|re/?max|keller\s?williams|"
                       r"century\s?21|coldwell\s?banker|sotheby|h&r\s?block|aspen\s?dental|terminix|orkin|"
                       r"planet\s?fitness|anytime\s?fitness|great\s?clips|supercuts|two\s?men\s?and\s?a\s?truck", re.I)
NOT_OWN = re.compile(r"facebook\.com|instagram\.com|linkedin\.com|linktr\.ee|sites\.google\.com|business\.site|"
                     r"wixsite\.com|weebly\.com|godaddysites\.com|yelp\.com|angi\.com|thumbtack\.com", re.I)
NON_US = re.compile(r"\b(canada|united kingdom|england|scotland|ireland|australia|new zealand|india|pakistan|"
                    r"philippines|singapore|germany|france|spain|italy|portugal|brazil|brasil|mexico|"
                    r"netherlands|sweden|poland|israel|uae|dubai|south africa|nigeria|japan|china)\b", re.I)
US_TAIL = {"united states", "usa", "us", "u.s.", "u.s.a."}
STATE_NAMES = {"alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware",
               "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
               "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
               "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico",
               "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
               "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
               "virginia", "washington", "west virginia", "wisconsin", "wyoming", "district of columbia"}
STATE_CODES = {"AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
               "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND",
               "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"}
BAD_CATEGORY = {3, 4, 7, 9}


def parse_city(location: str) -> tuple[str, bool]:
    """(city, is_us). "Cockeysville, Maryland, United States" -> ("Cockeysville", True)."""
    parts = [p.strip() for p in (location or "").split(",") if p.strip()]
    if not parts:
        return "", True
    is_us = True
    if parts[-1].lower() in US_TAIL:
        parts = parts[:-1]
    elif NON_US.search(parts[-1]):
        return "", False
    if parts and (parts[-1].lower() in STATE_NAMES or parts[-1].upper() in STATE_CODES):
        parts = parts[:-1]
    if not parts:
        return "", is_us            # only a state or a country: no city to speak of
    city = parts[0]
    if city.lower() in STATE_NAMES or city.lower() in US_TAIL or len(city) < 3 or re.search(r"\d", city):
        return "", is_us
    return city, is_us


# 17/09 rehearsal: "construction" took 113 of 382 leads because any "contractor"
# matched. A drywall or excavation outfit asked about "a good general contractor"
# is exactly the generic e-mail the founder rejected — so a sub-trade we have no
# words for is left out instead of being called a general contractor.
NOT_GENERAL = re.compile(r"drywall|insulation|excavat|demolition|window|siding|gutter|masonry|weld|steel|"
                         r"supply|supplies|equipment|rental|engineer|consult|scaffold|crane|survey|material", re.I)


def classify(company: str, website: str) -> str | None:
    text = f"{company} {website}"
    for name, rx in SEGMENT_RULES:
        if rx.search(text):
            if name == "construction" and NOT_GENERAL.search(text):
                return None
            return name
    return None


def personalize(copy: dict, lead: dict) -> tuple[dict | None, str]:
    """Return (custom_fields + route, "") or (None, reason). Pure: no I/O."""
    company = (lead.get("company_name") or "").strip()
    website = (lead.get("website") or lead.get("company_url") or "").strip()
    first = (lead.get("first_name") or "").strip()
    if lead.get("is_unsubscribed") or lead.get("lead_category_id") in BAD_CATEGORY:
        return None, "stop_ou_unsub"
    if not first or len(first) < 2 or not re.match(r"^[A-Za-zÀ-ÿ' -]+$", first):
        return None, "sem_first_name"
    if not company:
        return None, "sem_empresa"
    if not website or "." not in website or NOT_OWN.search(website):
        return None, "sem_site_proprio"
    text = f"{company} {website}"
    if EXCLUDE.search(text):
        return None, "excluida_regra"
    if FRANCHISE.search(text):
        return None, "franquia_nacional"
    city, is_us = parse_city(lead.get("location") or "")
    if not is_us:
        return None, "nao_us"
    if not city:
        return None, "sem_cidade"
    segment = classify(company, website)
    if not segment or segment not in copy["segments"]:
        return None, "sem_segmento"
    seg = copy["segments"][segment]
    fields = {"city": city, "trade": seg["trade"], "a_trade": seg["a_trade"],
              "buyer_question": seg["buyer_question"].replace("{city}", city),
              "job": seg["job"], "pain_task": seg["pain_task"], "lost_hour": seg["lost_hour"]}
    if any(not str(v).strip() for v in fields.values()):
        return None, "campo_vazio"
    route = "stack" if segment in copy["stack_segments"] else "geo"
    return {"custom_fields": fields, "route": route, "segment": segment}, ""


# --------------------------------------------------------------------------
# 4. SmartLead I/O (only reached by `create` and `load`)
# --------------------------------------------------------------------------

def sl(path: str, payload: dict | None = None, method: str | None = None):
    key = os.environ.get("SL_KEY", "")
    url = f"{BASE}{path}{'&' if '?' in path else '?'}api_key={key}"
    data = json.dumps(payload).encode() if payload is not None else None
    headers = dict(UA)
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode()
            # 17/09, first live load: DELETE /campaigns/{id}/leads/{lead_id} answers 2xx
            # with a body that is NOT JSON. Parsing it blindly turned 394 successful
            # removals into "failures" and stopped the move half way. The HTTP status
            # is the verdict; an unparseable 2xx body is kept as text, not as an error.
            try:
                parsed = json.loads(body) if body.strip() else {}
            except ValueError:
                parsed = {"_raw": body[:120]}
            return r.status, parsed
    except urllib.error.HTTPError as e:
        return e.code, {"_http_error": e.code, "_body": e.read().decode(errors="replace")[:240]}
    except Exception as e:  # noqa: BLE001 — network failure is reported, never swallowed
        return 0, {"_error": type(e).__name__}


def bad(status: int, d) -> bool:
    return status == 0 or status >= 400 or (isinstance(d, dict) and ("_http_error" in d or "_error" in d))


def campaign_index() -> dict:
    s, camps = sl("/campaigns")
    if bad(s, camps) or not isinstance(camps, list):
        out({"ok": False, "motivo": f"GET /campaigns falhou: HTTP {s}"})
        raise SystemExit(1)
    return {c.get("name"): c for c in camps}


def cmd_create(copy: dict, names: dict, confirm: bool) -> int:
    plan = {k: {"campanha": names[k], "toques": len(copy["campaigns"][k]["steps"]),
                "variantes_por_toque": [len(s["variants"]) for s in copy["campaigns"][k]["steps"]]}
            for k in ("geo", "stack")}
    if not confirm:
        out({"ok": True, "modo": "ENSAIO — nada foi criado nem alterado", "copy": copy["version"], "plano": plan,
             "para_executar": "re-correr com confirm=yes"})
        return 0
    by_name = campaign_index()
    results = []
    for key in ("geo", "stack"):
        name = names[key]
        existing = by_name.get(name)
        created = False
        if existing:
            cid = existing["id"]
            status = str(existing.get("status") or "").upper()
            if status not in ("DRAFTED", "PAUSED", ""):
                results.append({"campanha": name, "campaign_id": cid, "ok": False,
                                "motivo": f"campanha esta {status}: a copy de uma campanha ATIVA nao e reescrita por aqui"})
                continue
        else:
            s, res = sl("/campaigns/create", {"name": name})
            cid = res.get("id") if isinstance(res, dict) else None
            created = True
            if bad(s, res) or not cid:
                results.append({"campanha": name, "ok": False, "motivo": f"create falhou: HTTP {s}"})
                continue
        steps = {}
        s, r = sl(f"/campaigns/{cid}/sequences", {"sequences": build_sequences(copy, key, name)})
        steps["sequences"] = "ok" if not bad(s, r) else f"HTTP {s} {json.dumps(r)[:160]}"
        s, r = sl(f"/campaigns/{cid}/schedule", SCHEDULE)
        steps["schedule"] = "ok" if not bad(s, r) else f"HTTP {s}"
        s, r = sl(f"/campaigns/{cid}/settings", SETTINGS)
        steps["settings"] = "ok" if not bad(s, r) else f"HTTP {s}"
        # Read back: "saved" is not "there". Count the variants SmartLead actually holds.
        s, back = sl(f"/campaigns/{cid}/sequences")
        held = []
        if isinstance(back, list):
            for row in sorted(back, key=lambda x: x.get("seq_number") or 0):
                variants = row.get("sequence_variants") or row.get("seq_variants") or []
                held.append(max(1, len(variants)))
        expected = [len(st["variants"]) for st in copy["campaigns"][key]["steps"]]
        steps["variantes_lidas_de_volta"] = held
        if held != expected:
            steps["ab"] = f"ESPERADO {expected}, SmartLead guarda {held} — o teste A/B NAO esta montado"
        else:
            steps["ab"] = "ok"
        s, detail = sl(f"/campaigns/{cid}")
        status = str((detail or {}).get("status", "?")).upper() if isinstance(detail, dict) else "?"
        if status in ("ACTIVE", "STARTED", "START"):
            sl(f"/campaigns/{cid}/status", {"status": "PAUSED"})
            status = "PAUSED (estava ativa — pausada por este workflow)"
        ok = all(v == "ok" for k2, v in steps.items() if k2 != "variantes_lidas_de_volta")
        results.append({"campanha": name, "campaign_id": cid, "criada_agora": created, "status": status,
                        "ok": ok, "passos": steps})
    ok = all(r.get("ok") for r in results)
    out({"ok": ok, "modo": "execucao", "copy": copy["version"], "campanhas": results,
         "nunca_iniciada": "este script nao tem acao start — quem inicia e o founder, pelo smartlead-launch.yml (confirm=GO)"})
    return 0 if ok else 1


def fetch_leads(cid: str) -> list[dict]:
    rows, off = [], 0
    while True:
        s, d = sl(f"/campaigns/{cid}/leads?offset={off}&limit=100")
        batch = d.get("data") if isinstance(d, dict) else None
        if bad(s, d) or not batch:
            break
        rows.extend(batch)
        off += len(batch)
        if off > 20000:
            break
    return rows


def campaign_suppression(cid: str) -> tuple[set[str], dict]:
    """E-mails of a campaign that must never be written to again, from
    SmartLead's OWN per-lead statistics: bounced, replied, unsubscribed.
    Returns (set, facts). Nothing is printed but counts. A campaign whose
    statistics cannot be read yields facts["ok"] = False and the caller leaves
    its touched leads OUT (fail closed)."""
    suppress: set[str] = set()
    facts = {"ok": False, "linhas": 0, "bounced": 0, "replied": 0, "unsub": 0, "chaves": []}
    bounced, replied, unsub = set(), set(), set()
    off = 0
    while True:
        s, d = sl(f"/campaigns/{cid}/statistics?offset={off}&limit=100")
        rows = d.get("data") if isinstance(d, dict) else None
        if bad(s, d) or rows is None:
            return set(), facts
        if not rows:
            break
        if not facts["chaves"]:
            facts["chaves"] = sorted(rows[0].keys())[:40]
        for r in rows:
            em = str(r.get("lead_email") or "").strip().lower()
            if not em:
                continue
            if r.get("is_bounced"):
                bounced.add(em)
            if r.get("reply_time"):
                replied.add(em)
            if r.get("is_unsubscribed"):
                unsub.add(em)
        facts["linhas"] += len(rows)
        off += len(rows)
        if off > 60000:
            break
    known = {"is_bounced", "reply_time", "is_unsubscribed", "lead_email"}
    facts.update(bounced=len(bounced), replied=len(replied), unsub=len(unsub),
                 ok=facts["linhas"] > 0 and known.issubset(set(facts["chaves"])))
    return (bounced | replied | unsub), facts


def site_alive(url: str) -> bool:
    target = url if re.match(r"^https?://", url, re.I) else f"https://{url}"
    try:
        req = urllib.request.Request(target, headers=UA)
        with urllib.request.urlopen(req, timeout=8) as r:
            return 200 <= r.status < 400
    except Exception:  # noqa: BLE001 — a dead site is a fact, not an error
        return False


def resolve_destinations(by_name: dict, names: dict, confirm: bool) -> tuple[dict, list[str], str]:
    """(dest ids, notes, abort reason). A REHEARSAL counts leads even before the
    campaigns exist (17/09: the first rehearsal aborted on "nao existe — correr
    create primeiro", which made it useless for deciding whether to create). A
    real run still refuses a missing destination, and BOTH modes refuse an
    active one: adding a lead to an active campaign is sending e-mail."""
    dest, notes = {}, []
    for key in ("geo", "stack"):
        c = by_name.get(names[key])
        if not c:
            if confirm:
                return {}, notes, f"campanha de destino '{names[key]}' nao existe — correr create primeiro"
            notes.append(f"'{names[key]}' ainda nao existe (ensaio segue; correr create antes do load real)")
            continue
        status = str(c.get("status") or "").upper()
        if status not in ("DRAFTED", "PAUSED"):
            return {}, notes, f"'{names[key]}' esta {status}: adicionar lead a campanha ativa e ENVIAR e-mail. Abortado."
        dest[key] = c["id"]
    return dest, notes, ""


def cmd_load(copy: dict, names: dict, sources: list[str], cap: int, check_sites: bool, confirm: bool,
             touched_sources: list[str] | None = None) -> int:
    by_name = campaign_index()
    dest, dest_notes, abort = resolve_destinations(by_name, names, confirm)
    if abort:
        out({"ok": False, "motivo": abort})
        return 1
    reasons: dict[str, int] = {}
    seen_domains: set[str] = set()
    picked = {"geo": [], "stack": []}
    by_segment: dict[str, int] = {}
    read = 0
    # 17/09, founder: also use the leads of the old campaigns, minus bounces and
    # STOPs. A touched lead (COMPLETED) enters only when SmartLead's own
    # statistics for that campaign could be read and do not show a bounce, a
    # reply or an unsubscribe for it. People who replied are left to a human.
    touched_sources = touched_sources or []
    suppress: set[str] = set()
    suppression_facts: dict[str, dict] = {}
    readable: set[str] = set()
    for cid in touched_sources:
        sset, facts = campaign_suppression(cid)
        suppression_facts[cid] = {k: v for k, v in facts.items() if k != "chaves"} | {"chaves_ok": facts["ok"]}
        if facts["ok"]:
            readable.add(cid)
            suppress |= sset
    for cid in list(sources) + [c for c in touched_sources if c not in sources]:
        is_touched_source = cid in touched_sources
        for row in fetch_leads(cid):
            read += 1
            lead = dict(row.get("lead") or row)
            lead["lead_category_id"] = row.get("lead_category_id")
            status = str(row.get("status") or "").strip().upper()
            email_l = str(lead.get("email") or "").strip().lower()
            if email_l in suppress:
                reasons["bounce_resposta_ou_stop"] = reasons.get("bounce_resposta_ou_stop", 0) + 1
                continue
            if status == "COMPLETED" and is_touched_source:
                if cid not in readable:
                    reasons["tocada_sem_estatistica_legivel"] = reasons.get("tocada_sem_estatistica_legivel", 0) + 1
                    continue
                lead["_touched"] = True
            elif status != "STARTED":        # STARTED = imported, never e-mailed (measured 11/09)
                reasons["ja_tocada_ou_bloqueada"] = reasons.get("ja_tocada_ou_bloqueada", 0) + 1
                continue
            res, why = personalize(copy, lead)
            if not res:
                reasons[why] = reasons.get(why, 0) + 1
                continue
            domain = re.sub(r"^https?://(www\.)?", "", (lead.get("website") or lead.get("company_url") or "").lower()).split("/")[0]
            if domain in seen_domains:
                reasons["dominio_duplicado"] = reasons.get("dominio_duplicado", 0) + 1
                continue
            seen_domains.add(domain)
            res.update({"lead_id": lead.get("id"), "source": cid, "email": lead.get("email"), "touched": bool(lead.get("_touched")),
                        "first_name": lead.get("first_name"), "last_name": lead.get("last_name"),
                        "company_name": lead.get("company_name"), "website": lead.get("website") or lead.get("company_url"),
                        "location": lead.get("location")})
            picked[res["route"]].append(res)
    if check_sites:
        everyone = picked["geo"] + picked["stack"]
        with ThreadPoolExecutor(max_workers=16) as pool:
            alive = list(pool.map(lambda r: site_alive(r["website"]), everyone))
        for r, ok in zip(everyone, alive):
            r["alive"] = ok
        for key in picked:
            dead = [r for r in picked[key] if not r["alive"]]
            reasons["site_nao_respondeu"] = reasons.get("site_nao_respondeu", 0) + len(dead)
            picked[key] = [r for r in picked[key] if r["alive"]]
    for key in picked:
        if len(picked[key]) > cap:
            reasons["acima_do_teto"] = reasons.get("acima_do_teto", 0) + len(picked[key]) - cap
            picked[key] = picked[key][:cap]
        for r in picked[key]:
            by_segment[r["segment"]] = by_segment.get(r["segment"], 0) + 1
    summary = {"leads_lidas": read, "elegiveis": {k: len(v) for k, v in picked.items()},
               "por_segmento": dict(sorted(by_segment.items(), key=lambda x: -x[1])),
               "fora_por_motivo": dict(sorted(reasons.items(), key=lambda x: -x[1])),
               "teto_por_campanha": cap, "checou_sites": check_sites, "avisos": dest_notes,
               "das_quais_ja_tocadas_na_leva_1": sum(1 for k in picked for r in picked[k] if r.get("touched")),
               "supressao_por_campanha": suppression_facts}
    if not confirm:
        sample = None
        if picked["geo"]:
            r = picked["geo"][0]
            vals = dict(r["custom_fields"], first_name="<first_name>", company_name=r["company_name"], campaign=names["geo"])
            v = copy["campaigns"]["geo"]["steps"][0]["variants"][0]
            sample = {"subject": merge(v["subject"], vals), "body": merge("\n".join(v["body"]), vals)}
        out(dict(summary, ok=True, modo="ENSAIO — nenhuma lead foi movida", amostra_sem_nome_de_pessoa=sample,
                 para_executar="re-correr com confirm=yes"))
        return 0
    added, removed, add_fail, del_fail, first_error = {}, 0, 0, 0, None
    api_counts: dict[str, float] = {}
    api_keys: set[str] = set()
    # Measured 17/09: SmartLead refused 358 of 366 touched leads ("already added
    # to campaign") — by default a lead that already ran in another campaign is
    # not accepted in a new one. Re-using them is the founder's explicit call, so
    # ONLY the touched leads are sent with that check lifted; block list and
    # unsubscribe list stay enforced for everyone.
    for key, touched_flag in (("geo", False), ("stack", False), ("geo", True), ("stack", True)):
        group = [r for r in picked[key] if bool(r.get("touched")) == touched_flag]
        for i in range(0, len(group), 100):
            chunk = group[i:i + 100]
            payload = {"settings": {"ignore_global_block_list": False, "ignore_unsubscribe_list": False,
                                    "ignore_duplicate_leads_in_other_campaign": touched_flag},
                       "lead_list": [{"email": r["email"], "first_name": r["first_name"], "last_name": r["last_name"],
                                      "company_name": r["company_name"], "website": r["website"],
                                      "location": r["location"], "custom_fields": r["custom_fields"]}
                                     for r in chunk if r.get("email")]}
            s, d = sl(f"/campaigns/{dest[key]}/leads", payload, method="POST")
            if bad(s, d):
                add_fail += len(chunk)
                first_error = first_error or {"etapa": "add", "http": s, "resp": json.dumps(d)[:200]}
                break
            added[names[key]] = added.get(names[key], 0) + len(payload["lead_list"])
            # What SmartLead SAYS it did with them — "sent" is not "uploaded".
            if isinstance(d, dict):
                for k2 in ("upload_count", "total_leads", "already_added_to_campaign", "duplicate_count",
                           "invalid_email_count", "unsubscribed_leads", "block_count", "bounce_count",
                           "skipped_in_other_campaign_count", "lead_import_stopped_count"):
                    if isinstance(d.get(k2), (int, float)) and not isinstance(d.get(k2), bool):
                        api_counts[k2] = api_counts.get(k2, 0) + d[k2]
                api_keys.update(d.keys())
            for r in chunk:
                if r.get("touched"):
                    continue            # a touched lead keeps its history in the campaign that e-mailed it
                s2, d2 = sl(f"/campaigns/{r['source']}/leads/{r['lead_id']}", method="DELETE")
                if bad(s2, d2):
                    del_fail += 1
                    first_error = first_error or {"etapa": "delete", "http": s2, "resp": json.dumps(d2)[:200]}
                    if del_fail >= 3 and removed == 0:
                        break
                else:
                    removed += 1
    ok = add_fail == 0 and del_fail == 0
    out(dict(summary, ok=ok, modo="execucao", enviadas_ao_smartlead=added, contagem_do_smartlead=api_counts,
             chaves_da_resposta_add=sorted(api_keys)[:20], removidas_da_origem=removed,
             falhas_add=add_fail, falhas_delete=del_fail, primeiro_erro=first_error,
             nunca_iniciada="as campanhas continuam DRAFTED/PAUSED — quem inicia e o founder"))
    return 0 if ok else 1


def cmd_prune(names: dict, confirm: bool) -> int:
    """Pause, inside the two NEW campaigns, the leads whose site does not answer.
    17/09: one load ran with the site check off and let in 72 leads whose site
    had not answered — a dead site is the best predictor of a dead mailbox, and
    the account already shows bounce-critical senders. Two tries per site; a
    lead is PAUSED (reversible), never deleted."""
    by_name = campaign_index()
    report, to_pause = {}, []
    for key in ("geo", "stack"):
        c = by_name.get(names[key])
        if not c:
            continue
        rows = [dict(r.get("lead") or r, _status=str(r.get("status") or "").upper()) for r in fetch_leads(str(c["id"]))]
        live = [r for r in rows if r["_status"] not in ("PAUSED", "BLOCKED", "COMPLETED")]
        with ThreadPoolExecutor(max_workers=16) as pool:
            first = list(pool.map(lambda r: site_alive(r.get("website") or r.get("company_url") or ""), live))
            retry = [r for r, ok in zip(live, first) if not ok]
            second = list(pool.map(lambda r: site_alive(r.get("website") or r.get("company_url") or ""), retry))
        dead = [r for r, ok in zip(retry, second) if not ok]
        report[names[key]] = {"leads": len(rows), "verificadas": len(live), "site_nao_respondeu_2x": len(dead)}
        to_pause += [(c["id"], r.get("id")) for r in dead if r.get("id")]
    if not confirm:
        out({"ok": True, "modo": "ENSAIO — nenhuma lead foi pausada", "campanhas": report})
        return 0
    paused, fail, first_error = 0, 0, None
    for cid, lid in to_pause:
        s, d = sl(f"/campaigns/{cid}/leads/{lid}/pause", {}, method="POST")
        if bad(s, d):
            fail += 1
            first_error = first_error or {"http": s, "resp": json.dumps(d)[:200]}
            if fail >= 3 and paused == 0:
                break
        else:
            paused += 1
    out({"ok": fail == 0, "modo": "execucao", "campanhas": report, "pausadas": paused, "falhas": fail, "primeiro_erro": first_error})
    return 0 if fail == 0 else 1


# --------------------------------------------------------------------------
# 5. SmartProspect (lead finder) by API — search is free, FETCH spends credits
# --------------------------------------------------------------------------
# 17/09: the founder asked to spend the lead-finder credits on the ICP and load
# the result into today's campaigns. Driving the UI by clicks was slow and
# fragile; SmartLead documents the same thing as an API:
#   POST search-contacts  -> total_count + filter_id          (free)
#   POST fetch-contacts   -> unlocks e-mails, 1 credit each   (SPENDS)
#   POST get-contacts     -> the unlocked contacts, filterable by verification
# Rules: rehearsal by default (search only); --confirm spends AT MOST --limit
# credits; only `valid` e-mails are loaded (the account shows bounce-critical
# mailboxes); a contact that cannot be personalized is not loaded; nothing is
# ever started. Aggregates only in the output — never a name or an address.

PROSPECT_BASE = "https://prospect-api.smartlead.ai/api/v1/search-email-leads"
FREE_MAIL = re.compile(r"@(gmail|yahoo|hotmail|outlook|aol|icloud|me|msn|live|comcast|att|verizon|sbcglobal)\.", re.I)

# What the buyer's company NAME has to contain, per trade. The name must carry
# the trade, or the lead cannot be personalized afterwards and the credit is wasted.
TRADE_SEARCH = {
    "roofing": ["Roofing"], "hvac": ["HVAC", "Heating and Cooling", "Heating & Cooling", "Air Conditioning"],
    "plumbing": ["Plumbing"], "remodeling": ["Remodeling"], "electrical": ["Electric"],
    "landscaping": ["Landscaping"], "painting": ["Painting"], "concrete/paving": ["Concrete", "Paving"],
    "flooring": ["Flooring"], "fencing": ["Fence", "Fencing"], "pest": ["Pest Control"],
    "cleaning": ["Cleaning"], "pool": ["Pools"], "garage/doors": ["Garage Door"],
    "law firm": ["Law Firm", "Law Office"], "agency/saas": ["Marketing Agency"],
    "it services": ["IT Services", "Managed Services"], "design/media": ["Design Studio"],
}


def sp(path: str, payload: dict):
    key = os.environ.get("SL_KEY", "")
    req = urllib.request.Request(f"{PROSPECT_BASE}/{path}?api_key={key}", data=json.dumps(payload).encode(),
                                 headers=dict(UA, **{"Content-Type": "application/json"}), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            body = r.read().decode()
            return r.status, (json.loads(body) if body.strip() else {})
    except urllib.error.HTTPError as e:
        return e.code, {"_http_error": e.code, "_body": e.read().decode(errors="replace")[:240]}
    except Exception as e:  # noqa: BLE001
        return 0, {"_error": type(e).__name__}


def search_payload(trade: str, limit: int) -> dict:
    return {"limit": max(1, min(500, limit)), "title": ["owner", "founder", "president"],
            "companyName": TRADE_SEARCH[trade], "companyHeadCount": ["0 - 25", "25 - 100"],
            "country": ["United States"], "dontDisplayOwnedContact": True}


def contact_to_lead(c: dict) -> dict:
    """SmartProspect contact -> the lead shape personalize() reads. Tolerant on
    purpose: the docs show `company: {name, website}` and do not list location."""
    company = c.get("company")
    comp = company if isinstance(company, dict) else {}
    name = comp.get("name") or (company if isinstance(company, str) else "") or c.get("companyName") or ""
    website = comp.get("website") or comp.get("domain") or c.get("companyDomain") or c.get("website") or ""
    email = (c.get("email") or "").strip()
    if not website and email and "@" in email and not FREE_MAIL.search(email):
        website = email.split("@", 1)[1]          # a verified business address lives on the company's own domain
    loc = c.get("location")
    if not isinstance(loc, str) or not loc.strip():
        loc = ", ".join(str(c.get(k) or comp.get(k) or "").strip() for k in ("city", "state", "country")
                        if str(c.get(k) or comp.get(k) or "").strip())
    return {"first_name": (c.get("firstName") or "").strip(), "last_name": (c.get("lastName") or "").strip(),
            "email": email, "company_name": str(name).strip(), "website": str(website).strip(), "location": loc}


def shape_of(obj, depth: int = 0):
    """Key structure only — never a value. How the first contact is shaped."""
    if isinstance(obj, dict) and depth < 2:
        return {k: shape_of(v, depth + 1) for k, v in sorted(obj.items())}
    return type(obj).__name__


def cmd_prospect(copy: dict, names: dict, trade: str, limit: int, confirm: bool, filter_id: int = 0) -> int:
    if trade not in TRADE_SEARCH or trade not in copy["segments"]:
        out({"ok": False, "motivo": f"oficio '{trade}' sem palavras de busca ou sem copy", "oficios": sorted(TRADE_SEARCH)})
        return 1
    if filter_id:
        # COLLECT: an unlock that already happened (and was already paid for).
        # No search, no fetch, no credit — only read the valid contacts and load.
        data = {"filter_id": filter_id, "total_count": None, "list": []}
    else:
        s, d = sp("search-contacts", search_payload(trade, limit))
        data = d.get("data") if isinstance(d, dict) else None
        if bad(s, d) or not isinstance(data, dict) or not d.get("success", True):
            out({"ok": False, "etapa": "search", "http": s, "resp": json.dumps(d)[:300]})
            return 1
    page = data.get("list") or []
    reasons: dict[str, int] = {}
    fit = 0
    for c in page:
        res, why = personalize(copy, contact_to_lead(c))
        if res and res["segment"] == trade:
            fit += 1
        else:
            why = why or f"classificado_como_{res['segment']}"
            reasons[why] = reasons.get(why, 0) + 1
    summary = {"oficio": trade, "busca": TRADE_SEARCH[trade], "total_na_base": data.get("total_count"),
               "filter_id": data.get("filter_id"), "amostra": len(page), "amostra_personalizavel": fit,
               "amostra_fora_por_motivo": reasons, "forma_do_contato": shape_of(page[0]) if page else None}
    if not confirm:
        out(dict(summary, ok=True, modo="ENSAIO — busca gratis, NENHUM credito gasto",
                 nota="sem e-mail ainda, o site pode faltar na amostra; apos o fetch ele vem do dominio do e-mail",
                 para_executar=f"re-correr com confirm=yes: gasta ate {limit} creditos (1 por e-mail encontrado)"))
        return 0
    by_name = campaign_index()
    dest, notes, abort = resolve_destinations(by_name, names, True)
    if abort:
        out({"ok": False, "motivo": abort, "creditos_gastos": 0})
        return 1
    fdata = None
    if not filter_id:
        s, f = sp("fetch-contacts", {"filter_id": data["filter_id"], "limit": limit, "visual_limit": 1000})
        fdata = f.get("data") if isinstance(f, dict) else None
        if bad(s, f) or not isinstance(f, dict) or f.get("success") is False:
            out(dict(summary, ok=False, etapa="fetch", http=s, resp=json.dumps(f)[:300]))
            return 1
    import time
    metrics = (fdata or {}).get("metrics") or {}
    contacts: list[dict] = []
    stable, last_sig = 0, None
    deadline = time.time() + 30 * 60
    while time.time() < deadline:
        contacts, off = [], 0
        while True:
            s, g = sp("get-contacts", {"filter_id": data["filter_id"], "limit": 1000, "offset": off, "verification_status": "valid"})
            gdata = g.get("data") if isinstance(g, dict) else None
            chunk = (gdata or {}).get("list") or []
            metrics = (gdata or {}).get("metrics") or metrics
            contacts.extend(chunk)
            off += len(chunk)
            if len(chunk) < 1000:
                break
        # The unlock is ASYNCHRONOUS and `completed` is a running COUNT (17/09: a
        # 300-contact batch read `completed: 52` and was taken for finished — 19
        # leads loaded, ~250 left behind, credits spent). There is no reliable
        # "done" flag: the final count can stay below totalContacts. Done = the
        # processed count AND the valid list both stopped moving for 8 polls in a
        # row (2 minutes), after at least one contact was processed.
        done_n = metrics.get("completed") or 0
        sig = (done_n, len(contacts))
        stable = stable + 1 if (sig == last_sig and done_n) else 0
        last_sig = sig
        if stable >= 8:
            break
        time.sleep(15)
    picked = {"geo": [], "stack": []}
    seen: set[str] = set()
    for c in contacts:
        lead = contact_to_lead(c)
        res, why = personalize(copy, lead)
        if not res or not lead["email"]:
            why = why or "sem_email"
            reasons[why] = reasons.get(why, 0) + 1
            continue
        dom = lead["email"].split("@", 1)[1].lower()
        if dom in seen:
            reasons["dominio_duplicado"] = reasons.get("dominio_duplicado", 0) + 1
            continue
        seen.add(dom)
        picked[res["route"]].append(dict(lead, custom_fields=res["custom_fields"]))
    added, fail, first_error = {}, 0, None
    for key in ("geo", "stack"):
        group = picked[key]
        for i in range(0, len(group), 100):
            chunk = group[i:i + 100]
            payload = {"lead_list": [{k: r[k] for k in ("email", "first_name", "last_name", "company_name", "website", "location", "custom_fields")} for r in chunk],
                       "settings": {"ignore_global_block_list": False, "ignore_unsubscribe_list": False}}
            s2, d2 = sl(f"/campaigns/{dest[key]}/leads", payload, method="POST")
            if bad(s2, d2):
                fail += len(chunk)
                first_error = first_error or {"http": s2, "resp": json.dumps(d2)[:200]}
                break
            added[names[key]] = added.get(names[key], 0) + len(chunk)
    out(dict(summary, ok=fail == 0, modo="execucao", metricas_do_fetch=metrics, validos_lidos=len(contacts),
             carregadas=added, fora_por_motivo=reasons, falhas_add=fail, primeiro_erro=first_error,
             forma_do_contato_desbloqueado=shape_of({k: v for k, v in (contacts[0] if contacts else {}).items()}),
             nunca_iniciada="as campanhas continuam DRAFTED/PAUSED — quem inicia e o founder"))
    return 0 if fail == 0 else 1


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["validate", "render", "personalize", "create", "load", "prospect", "prune"])
    ap.add_argument("--trade", default="roofing")
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--filter-id", type=int, default=0, help="prospect: COLLECT an unlock already made (no credit spent)")
    ap.add_argument("--copy", default=COPY_PATH)
    ap.add_argument("--segment", default="roofing")
    ap.add_argument("--geo-name", default="")
    ap.add_argument("--stack-name", default="")
    ap.add_argument("--sources", default="3741204,3783524,3783526")
    ap.add_argument("--cap", type=int, default=800)
    ap.add_argument("--touched-sources", default="", help="campaigns whose COMPLETED leads may be re-used (minus bounce/reply/unsub)")
    ap.add_argument("--no-site-check", action="store_true")
    ap.add_argument("--confirm", action="store_true")
    a = ap.parse_args(argv)
    copy = load_copy(a.copy)
    errors = validate_copy(copy)
    if a.command == "validate":
        out({"ok": not errors, "copy": copy["version"], "segmentos": len(copy["segments"]), "erros": errors})
        return 0 if not errors else 1
    if errors:   # no other command runs on copy that breaks the rules
        out({"ok": False, "motivo": "a copy viola as regras da casa — nada foi feito", "erros": errors[:10]})
        return 1
    names = {"geo": a.geo_name or copy["campaigns"]["geo"]["default_name"],
             "stack": a.stack_name or copy["campaigns"]["stack"]["default_name"]}
    if a.command == "render":
        vals = segment_values(copy, a.segment, {"first_name": "Mark", "company_name": "McRay Roofing",
                                                "city": "Oklahoma City", "campaign": names["geo"]})
        for key in ("geo", "stack"):
            for ix, step in enumerate(copy["campaigns"][key]["steps"], start=1):
                for v in step["variants"]:
                    print(f"--- {v['id']} (dia +{step['delay_in_days']})\nSubject: {merge(v['subject'], vals)}\n")
                    print(merge("\n".join(v["body"]), vals) + "\n")
        return 0
    if a.command == "personalize":
        leads = json.load(sys.stdin)
        res = []
        for lead in leads:
            r, why = personalize(copy, lead)
            res.append({"ok": bool(r), "reason": why, **(r or {})})
        print(json.dumps(res, ensure_ascii=False))
        return 0
    if not os.environ.get("SL_KEY"):
        out({"ok": False, "motivo": "SL_KEY ausente"})
        return 1
    if a.command == "create":
        return cmd_create(copy, names, a.confirm)
    if a.command == "prune":
        return cmd_prune(names, a.confirm)
    if a.command == "prospect":
        if not 1 <= a.limit <= 500:
            out({"ok": False, "motivo": "limit tem de estar entre 1 e 500 por corrida (teto de creditos por corrida)"})
            return 1
        return cmd_prospect(copy, names, a.trade, a.limit, a.confirm, a.filter_id)
    sources = [s.strip() for s in a.sources.split(",") if s.strip()]
    touched = [x.strip() for x in a.touched_sources.split(",") if x.strip()]
    return cmd_load(copy, names, sources, a.cap, not a.no_site_check, a.confirm, touched)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

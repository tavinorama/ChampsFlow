#!/usr/bin/env python3
"""send_watch.py — "campaigns ACTIVE and nothing going out" must shout, and only then.

Why this file exists (18/09): the watch lived inline in the workflow and compared
the total sent NOW with the previous measurement, four hours earlier. On 17/09
the two v4 campaigns were paced at 100 new leads a day each; the day's quota went
out in the first hour, the next measurement found delta 0 and the job went red
with "ENVIO PARADO" while 200 e-mails had been sent that day. A watchdog that
cries wolf daily teaches the founder to ignore it (house rule: the watchdog must
not lie either).

The ruler now is day over day: the reference is the newest measurement that is
at least REF_MIN_AGE_H old. No growth against THAT, with a campaign ACTIVE, is a
real stop. Without a reference that old there is no alarm, only a new mark.

25/09 (C05-b, P10): the ruler is PER CAMPAIGN now. The total hid a stopped
campaign behind a sending one (Stack parked, Geo sending → "ok"). Each active
campaign is compared with its own measurement of a day ago, and only on a day
it is scheduled to send (SmartLead's days_of_the_week in the campaign's own
timezone): a weekday-only campaign is not "stopped" on Sunday. A schedule that
cannot be read counts every day as eligible — louder, never quieter.

Deterministic: stdlib only, no LLM. Aggregates only: no lead e-mail is printed.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

BASE = "https://server.smartlead.ai/api/v1"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh) OzvorOps/1.0", "Accept": "application/json"}
REF_MIN_AGE_H = 20          # a measurement younger than this is the same sending day
KEEP_DAYS = 8
STATE = pathlib.Path(".sl-watch/estado.json")


def load_history(raw: str | None) -> list[dict]:
    """Tolerant: the pre-18/09 state was {"total": n} with no timestamp — that is
    not a usable reference, so it reads as an empty history."""
    try:
        d = json.loads(raw or "")
    except Exception:
        return []
    hist = d.get("history") if isinstance(d, dict) else None
    if not isinstance(hist, list):
        return []
    return [h for h in hist if isinstance(h, dict) and isinstance(h.get("ts"), (int, float))
            and isinstance(h.get("total"), int)]


def eligible_day_started(ref_ts: float, now: float, days: list[int] | None, tz: str | None) -> bool:
    """True when a day on which the campaign is scheduled to send BEGAN inside
    (ref_ts, now], in the campaign's timezone. Days use SmartLead's convention
    (0 = Sunday … 6 = Saturday). days=None (schedule unreadable) = every day."""
    try:
        zone = ZoneInfo(tz) if tz else timezone.utc
    except Exception:  # noqa: BLE001 — an unknown zone name must not silence the watch
        zone = timezone.utc
    start = datetime.fromtimestamp(ref_ts, zone)
    end = datetime.fromtimestamp(now, zone)
    day = (start + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    while day <= end:
        wd = (day.weekday() + 1) % 7            # python: Monday=0 → SmartLead: Sunday=0
        if days is None or wd in days:
            return True
        day += timedelta(days=1)
    return False


def decide(history: list[dict], now: float, campaigns: list[dict]) -> dict:
    """Pure. One verdict per ACTIVE campaign against ITS OWN measurement of at
    least REF_MIN_AGE_H ago, counted only if a scheduled sending day began in
    between. campaigns: [{id, name, sent, days?, tz?}]. Returns the per-campaign
    list, which ones stopped, and the legacy totals."""
    per: list[dict] = []
    stopped: list[str] = []
    for c in campaigns:
        cid = str(c["id"])
        old_enough = [h for h in history if now - h["ts"] >= REF_MIN_AGE_H * 3600
                      and isinstance(h.get("per"), dict) and isinstance(h["per"].get(cid), int)]
        ref = max(old_enough, key=lambda h: h["ts"]) if old_enough else None
        delta = None if ref is None else int(c["sent"]) - ref["per"][cid]
        eligible = ref is not None and eligible_day_started(ref["ts"], now, c.get("days"), c.get("tz"))
        is_stopped = ref is not None and eligible and delta <= 0
        if is_stopped:
            stopped.append(str(c.get("name") or cid))
        per.append({"id": cid, "nome": c.get("name"), "enviados": int(c["sent"]),
                    "referencia_horas": None if ref is None else round((now - ref["ts"]) / 3600, 1),
                    "medicao_referencia": None if ref is None else ref["per"][cid], "delta": delta,
                    "dia_elegivel_no_intervalo": eligible if ref is not None else None,
                    "dias_agendados": c.get("days"), "parada": is_stopped})
    total = sum(int(c["sent"]) for c in campaigns)
    return {"campanhas": per, "paradas": stopped, "envio_parado": bool(stopped), "total_enviados": total}


def next_history(history: list[dict], now: float, total: int, per: dict[str, int] | None = None) -> list[dict]:
    kept = [h for h in history if now - h["ts"] <= KEEP_DAYS * 86400]
    return kept + [{"ts": int(now), "total": total, "per": per or {}}]


def get(path: str):
    url = f"{BASE}{path}{'&' if '?' in path else '?'}api_key={os.environ['SL_KEY']}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"_http": e.code}
    except Exception as e:                       # noqa: BLE001 — the type is the whole message
        return {"_erro": type(e).__name__}


def main() -> int:
    camps = get("/campaigns")
    if isinstance(camps, dict):
        print("RESULTADO_OZVOR" + json.dumps({"ok": False, "motivo": f"GET /campaigns falhou: {camps}"}))
        return 1
    ativas, unread = [], 0
    for c in camps:
        if str(c.get("status", "")).upper() not in ("ACTIVE", "START", "STARTED"):
            continue
        a = get(f"/campaigns/{c['id']}/analytics")
        if not isinstance(a, dict) or "_http" in a or "_erro" in a:
            unread += 1                           # "could not look" is not "zero sent"
            continue
        # Schedule: which days this campaign sends, in its own timezone. Unreadable
        # = every day eligible (the watch gets louder, never quieter).
        days, tz = None, None
        d = get(f"/campaigns/{c['id']}")
        if isinstance(d, dict) and "_http" not in d and "_erro" not in d:
            cron = d.get("scheduler_cron_value") or d.get("schedule") or {}
            raw_days = cron.get("days") or cron.get("days_of_the_week") if isinstance(cron, dict) else None
            if isinstance(raw_days, list) and all(isinstance(x, int) for x in raw_days):
                days = sorted(raw_days)
            tz = (cron.get("tz") or cron.get("timezone")) if isinstance(cron, dict) else None
        ativas.append({"id": str(c["id"]), "name": c.get("name"), "sent": int(a.get("sent_count") or 0), "days": days, "tz": tz})
    if unread:
        print("RESULTADO_OZVOR" + json.dumps({"ok": False, "motivo": f"{unread} campanha(s) ativa(s) sem analytics legível — não medi, não é zero"}))
        return 1

    now = time.time()
    history = load_history(STATE.read_text() if STATE.exists() else None)
    verdict = decide(history, now, ativas)
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps({"history": next_history(history, now, verdict["total_enviados"], {a["id"]: a["sent"] for a in ativas})}))

    avisado = "nao_aplicavel"
    if verdict["envio_parado"]:
        def linha(p: dict) -> str:
            estado = "PARADA" if p["parada"] else "a enviar"
            desde = "" if p["delta"] is None else " · +%s desde há %sh" % (p["delta"], p["referencia_horas"])
            return "· %s: %s enviados (acumulado), %s%s" % (p["nome"], p["enviados"], estado, desde)
        linhas = "\n".join(linha(p) for p in verdict["campanhas"])
        msg = ("🚨 SmartLead: ENVIO PARADO\n\n"
               f"{len(verdict['paradas'])} de {len(ativas)} campanha(s) ATIVA(s) sem e-mail novo num dia agendado: "
               f"{', '.join(verdict['paradas'])}.\n\n"
               f"{linhas}\n\n"
               "Onde olhar: quota/plano da conta no painel do SmartLead, saúde das caixas, "
               "fila de leads vazia, e se alguma campanha foi pausada na UI.")
        tg_token, tg_chat = os.environ.get("TG_TOKEN", ""), os.environ.get("TG_CHAT", "")
        if not (tg_token and tg_chat):
            avisado = "sem_canal (TELEGRAM_* ausentes nos secrets do Actions)"
            print("🚨 ENVIO PARADO — sem canal Telegram; alarme só neste summary.\n\n" + msg)
        else:
            data = urllib.parse.urlencode({"chat_id": tg_chat, "text": msg}).encode()
            try:
                urllib.request.urlopen(urllib.request.Request(
                    f"https://api.telegram.org/bot{tg_token}/sendMessage", data=data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"}), timeout=30).read()
                avisado = True
            except Exception as e:               # noqa: BLE001
                avisado = f"FALHOU: {type(e).__name__}"
    print("RESULTADO_OZVOR" + json.dumps({"ok": True, "campanhas_ativas": len(ativas), **verdict, "telegram": avisado}, ensure_ascii=False))
    return 1 if verdict["envio_parado"] else 0     # a real stop is red in the Actions panel


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "decide":   # test seam: pure, reads stdin, no network
        d = json.load(sys.stdin)
        print(json.dumps(decide(load_history(json.dumps(d.get("state"))), d["now"], d["campaigns"])))
        raise SystemExit(0)
    raise SystemExit(main())

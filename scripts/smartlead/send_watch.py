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


def decide(history: list[dict], now: float, total: int, active: int) -> dict:
    """Pure. Returns the reference used, the delta and whether sending stopped."""
    old_enough = [h for h in history if now - h["ts"] >= REF_MIN_AGE_H * 3600]
    ref = max(old_enough, key=lambda h: h["ts"]) if old_enough else None
    delta = None if ref is None else total - ref["total"]
    stopped = ref is not None and active > 0 and delta <= 0
    return {"referencia_horas": None if ref is None else round((now - ref["ts"]) / 3600, 1),
            "medicao_referencia": None if ref is None else ref["total"], "delta": delta, "envio_parado": stopped}


def next_history(history: list[dict], now: float, total: int) -> list[dict]:
    kept = [h for h in history if now - h["ts"] <= KEEP_DAYS * 86400]
    return kept + [{"ts": int(now), "total": total}]


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
    ativas, total, unread = [], 0, 0
    for c in camps:
        if str(c.get("status", "")).upper() not in ("ACTIVE", "START", "STARTED"):
            continue
        a = get(f"/campaigns/{c['id']}/analytics")
        if not isinstance(a, dict) or "_http" in a or "_erro" in a:
            unread += 1                           # "could not look" is not "zero sent"
            continue
        n = int(a.get("sent_count") or 0)
        ativas.append({"nome": c.get("name"), "enviados": n})
        total += n
    if unread:
        print("RESULTADO_OZVOR" + json.dumps({"ok": False, "motivo": f"{unread} campanha(s) ativa(s) sem analytics legível — não medi, não é zero"}))
        return 1

    now = time.time()
    history = load_history(STATE.read_text() if STATE.exists() else None)
    verdict = decide(history, now, total, len(ativas))
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps({"history": next_history(history, now, total)}))

    avisado = "nao_aplicavel"
    if verdict["envio_parado"]:
        linhas = "\n".join(f"· {a['nome']}: {a['enviados']} enviados (acumulado)" for a in ativas)
        msg = ("🚨 SmartLead: ENVIO PARADO\n\n"
               f"{len(ativas)} campanha(s) ATIVA(s) e ZERO e-mails novos nas últimas {verdict['referencia_horas']}h.\n\n"
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
    print("RESULTADO_OZVOR" + json.dumps({"ok": True, "campanhas_ativas": len(ativas), "total_enviados": total,
                                          **verdict, "telegram": avisado}, ensure_ascii=False))
    return 1 if verdict["envio_parado"] else 0     # a real stop is red in the Actions panel


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "decide":   # test seam: pure, reads stdin, no network
        d = json.load(sys.stdin)
        print(json.dumps(decide(load_history(json.dumps(d.get("state"))), d["now"], d["total"], d["active"])))
        raise SystemExit(0)
    raise SystemExit(main())

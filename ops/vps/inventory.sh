#!/usr/bin/env bash
# ops/vps/inventory.sh — READ-ONLY inventory of the Hermes VPS.
#
# Why (29/09/2026): nobody, including the founder, could say what runs on the
# VPS, under which user, from which file, on which schedule. The server code
# lives only on the machine and was patched in place by agents through /task.
# This script answers "what is there" without changing anything and without
# printing a single secret value.
#
# Rules this script keeps (tests/unit/vps-control-kit.test.ts pins them):
#   - it never writes, restarts, installs, deletes or edits anything;
#   - env files are read ONLY through key_names(), which drops the values;
#   - every free-text line passes through redact();
#   - it refuses to run inside an agent prompt (no TTY) unless --force.
#
# Run it in a REAL shell on the VPS (a new SSH session, not the Hermes tab):
#   bash inventory.sh            # prints the report
#   bash inventory.sh > inv.txt  # same, to a file you can send to Claude
set -uo pipefail

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1
if [ ! -t 0 ] && [ "$FORCE" = "0" ]; then
  echo "inventory.sh: no terminal on stdin. This looks like an agent prompt or a pipe." >&2
  echo "Open a real SSH session and run it there, or pass --force." >&2
  exit 2
fi

redact() {
  sed -E \
    -e 's/(Bearer |[Tt]oken[=:] ?|[Kk]ey[=:] ?|[Pp]assword[=:] ?|[Ss]ecret[=:] ?)[^ "'"'"']+/\1<redacted>/g' \
    -e 's/[A-Za-z0-9_\/+=-]{32,}/<redacted-long-string>/g'
}
key_names() { # prints ONLY the variable names of an env file
  [ -r "$1" ] || { echo "  (unreadable or absent: $1)"; return; }
  sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=.*/  \2/p' "$1" | sort -u
  local bad
  bad=$(grep -c -v -E '^[[:space:]]*(#|$)|^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' "$1" 2>/dev/null || true)
  echo "  lines that are not KEY=VALUE, comment or blank: ${bad:-0}"
}
fingerprint() { # 12 hex of sha256, size and mtime. Never the content.
  [ -r "$1" ] || { echo "  absent: $1"; return; }
  printf '  %s  sha256:%s  %s bytes  %s\n' "$1" "$(sha256sum "$1" | cut -c1-12)" "$(stat -c %s "$1")" "$(date -u -d "@$(stat -c %Y "$1")" +%Y-%m-%dT%H:%MZ)"
}
section() { printf '\n## %s\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

echo "# Ozvor VPS inventory — $(date -u +%Y-%m-%dT%H:%M:%SZ) — read-only, no secret values"

section "1. Machine"
echo "  host: $(hostname)"
echo "  os: $(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-unknown}")  kernel: $(uname -r)"
echo "  uptime: $(uptime -p 2>/dev/null)"
echo "  whoami: $(id -un) (uid $(id -u))"
df -h / 2>/dev/null | sed 's/^/  /'
free -h 2>/dev/null | sed -n '1,3p' | sed 's/^/  /'
echo "  pending security updates: $( (apt list --upgradable 2>/dev/null | grep -c -i security) || echo unknown)"
echo "  unattended-upgrades: $(systemctl is-enabled unattended-upgrades 2>/dev/null || echo not-installed)"
echo "  reboot required: $([ -f /var/run/reboot-required ] && echo YES || echo no)"

section "2. Who can log in"
echo "  users with a shell:"
awk -F: '$7 !~ /(nologin|false)$/ {print "    " $1 " (uid " $3 ") " $7}' /etc/passwd
echo "  sshd effective settings:"
if have sshd; then
  sshd -T 2>/dev/null | grep -E '^(permitrootlogin|passwordauthentication|pubkeyauthentication|port|allowusers|kbdinteractiveauthentication) ' | sed 's/^/    /'
else
  echo "    sshd not found"
fi
for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
  [ -r "$f" ] || continue
  echo "  authorized keys in $f (fingerprints and comments only):"
  ssh-keygen -lf "$f" 2>/dev/null | sed 's/^/    /'
done
echo "  last 10 logins:"
last -n 10 -w 2>/dev/null | sed 's/^/    /' | head -12

section "3. Network"
echo "  listening sockets (address, port, process):"
ss -tlnpH 2>/dev/null | awk '{print "    " $4 "  " $6}' | sed -E 's/users:\(\("([^"]+)".*/\1/' | sort -u
echo "  firewall:"
if have ufw; then ufw status verbose 2>/dev/null | sed 's/^/    /'; else echo "    ufw not installed"; fi
echo "  Caddy sites:"
for f in /etc/caddy/Caddyfile; do [ -r "$f" ] && grep -v -E '^[[:space:]]*#' "$f" | redact | sed 's/^/    /'; done

section "4. Services (systemd)"
for u in hermes.service caddy.service; do
  echo "  $u: enabled=$(systemctl is-enabled "$u" 2>/dev/null) active=$(systemctl is-active "$u" 2>/dev/null) since=$(systemctl show -p ActiveEnterTimestamp --value "$u" 2>/dev/null) restarts=$(systemctl show -p NRestarts --value "$u" 2>/dev/null)"
  systemctl cat "$u" 2>/dev/null | grep -E '^(User|Group|WorkingDirectory|ExecStart|Restart|EnvironmentFile|Environment|NoNewPrivileges|ProtectSystem|ProtectHome|ReadWritePaths)=' | redact | sed 's/^/    /'
done
echo "  other custom units in /etc/systemd/system:"
ls -1 /etc/systemd/system/*.service /etc/systemd/system/*.timer 2>/dev/null | sed 's/^/    /'
echo "  timers:"
systemctl list-timers --all --no-pager 2>/dev/null | sed -n '1,25p' | sed 's/^/    /'

section "5. Schedules (cron)"
for u in root $(ls /home 2>/dev/null); do
  c=$(crontab -l -u "$u" 2>/dev/null | grep -v -E '^[[:space:]]*(#|$)') || true
  [ -n "${c:-}" ] && { echo "  crontab of $u:"; echo "$c" | redact | sed 's/^/    /'; }
done
ls -1 /etc/cron.d 2>/dev/null | sed 's/^/  cron.d: /'

section "6. Hermes code on disk (fingerprints only; this is what must go into git)"
for f in /root/hermes-task-server.mjs /root/ozvor-video-job.mjs /root/ozvor-yt-script.mjs /root/cron/*.sh /root/*.mjs; do
  [ -e "$f" ] && fingerprint "$f"
done | sort -u
echo "  backups beside the code:"
ls -1 /root/*.bak* /root/cron/*.bak* 2>/dev/null | sed 's/^/    /'
echo "  is any of it under git?"
for d in /root /root/cron /root/hermes-work; do
  [ -d "$d/.git" ] && echo "    $d: git repo, HEAD $(git -C "$d" rev-parse --short HEAD 2>/dev/null), dirty files: $(git -C "$d" status --porcelain 2>/dev/null | wc -l)" || echo "    $d: NOT a git repo"
done
echo "  routes the server declares:"
[ -r /root/hermes-task-server.mjs ] && grep -o -E "['\"]/(health|task|content-job|publish|postiz-[a-z-]+|video-job|yt-script|webhook/[a-z-]+|status|version)[^'\"]*['\"]" /root/hermes-task-server.mjs | tr -d "'\"" | sort -u | sed 's/^/    /'
echo "  working directory of the jobs:"
[ -d /root/hermes-work ] && echo "    /root/hermes-work exists, $(ls -1A /root/hermes-work 2>/dev/null | wc -l) entries, $(du -sh /root/hermes-work 2>/dev/null | cut -f1)" || echo "    /root/hermes-work MISSING (every job fails with spawn ENOENT)"

section "7. Secrets: names only, never values"
for f in /root/hermes.env /root/.hermes/.env; do
  echo "  $f  mode=$(stat -c %a "$f" 2>/dev/null || echo absent) owner=$(stat -c %U "$f" 2>/dev/null || echo -)"
  key_names "$f"
done

section "8. Engines: installed, and do they answer?"
for e in claude codex gemini; do
  p=$(bash -lc "command -v $e" 2>/dev/null) && echo "  $e: $p  version: $(bash -lc "$e --version" 2>/dev/null | head -1 | redact)" || echo "  $e: not on the login PATH"
done
[ -x /root/.kimi-code/bin/kimi ] && echo "  kimi: /root/.kimi-code/bin/kimi" || echo "  kimi: not at /root/.kimi-code/bin/kimi"
echo "  node: $(bash -lc 'node --version' 2>/dev/null)"
echo "  (no engine is called here: a call spends quota. Use RUNBOOK.md section 3 to test one.)"
echo "  engine usage, last 24 h, from /root/logs/engine-usage.jsonl:"
if [ -r /root/logs/engine-usage.jsonl ] && have jq; then
  since=$(date -u -d '24 hours ago' +%s)
  jq -r --argjson s "$since" 'select((.ts|tostring|.[0:10]|tonumber? // 0) >= $s or ((.ts|tostring|fromdateiso8601? // 0) >= $s)) | [(.engine_used // "none"), (.ok|tostring)] | @tsv' /root/logs/engine-usage.jsonl 2>/dev/null | sort | uniq -c | sed 's/^/    /'
else
  echo "    log or jq not available"
fi

section "9. Backups and recovery"
echo "  provider snapshots: not visible from inside the machine; check the hosting panel"
ls -1d /root/backups /var/backups/ozvor* 2>/dev/null | sed 's/^/  found: /' || true
echo "  largest directories under /root:"
du -sh /root/* 2>/dev/null | sort -rh | head -8 | sed 's/^/    /'

section "10. What this report cannot tell"
echo "  - whether a token was copied elsewhere; whether the provider account has MFA;"
echo "  - what an agent did in the past (only what is on disk now);"
echo "  - inbox, Postiz, n8n or Railway state."
echo
echo "# end of inventory"

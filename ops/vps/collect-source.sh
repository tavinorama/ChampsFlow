#!/usr/bin/env bash
# ops/vps/collect-source.sh — copy the Hermes code that lives only on the VPS
# into a staging folder, so it can be committed to a PRIVATE git repository.
#
# It copies code, never env files. It refuses to stage a file that looks like
# it carries a secret and names the file and the line number (not the value).
# It writes ONLY inside the staging folder it creates.
set -euo pipefail

STAGE="${1:-/root/hermes-source-staging}"
if [ -e "$STAGE" ]; then echo "staging folder already exists: $STAGE (choose another path)"; exit 2; fi
mkdir -p "$STAGE/cron" "$STAGE/systemd" "$STAGE/caddy"

copy() { [ -r "$1" ] && cp -p "$1" "$2" && echo "staged $1"; return 0; }
for f in /root/hermes-task-server.mjs /root/ozvor-video-job.mjs /root/ozvor-yt-script.mjs; do copy "$f" "$STAGE/"; done
for f in /root/cron/*.sh; do copy "$f" "$STAGE/cron/"; done
copy /etc/systemd/system/hermes.service "$STAGE/systemd/"
copy /etc/caddy/Caddyfile "$STAGE/caddy/"
crontab -l > "$STAGE/cron/root.crontab" 2>/dev/null || true

# Env files: names only, as a template.
for f in /root/hermes.env /root/.hermes/.env; do
  [ -r "$f" ] || continue
  sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=.*/\2=/p' "$f" | sort -u >> "$STAGE/env.example"
done
sort -u -o "$STAGE/env.example" "$STAGE/env.example" 2>/dev/null || true

# Secret scan: a hit blocks the hand-over. Prints file:line, never the match.
hits=$(grep -r -n -I -E '(sk-[A-Za-z0-9_-]{20,}|ozk_live_[A-Za-z0-9]+|[0-9]{8,10}:[A-Za-z0-9_-]{30,}|Bearer [A-Za-z0-9._-]{20,}|(TOKEN|KEY|SECRET|PASSWORD)[A-Z_]*[[:space:]]*[=:][[:space:]]*["'"'"']?[A-Za-z0-9_\/+=-]{16,})' "$STAGE" --exclude=env.example | cut -d: -f1,2 || true)
if [ -n "$hits" ]; then
  echo
  echo "BLOCKED: these lines look like they carry a secret. Move the value to hermes.env,"
  echo "read it from process.env in the code, run this script again. Nothing was sent anywhere."
  echo "$hits" | sed 's/^/  /'
  exit 3
fi
cat > "$STAGE/.gitignore" <<'IGN'
*.env
.env*
!env.example
*.bak*
logs/
hermes-work/
IGN
echo
echo "OK: $(find "$STAGE" -type f | wc -l) files staged in $STAGE, no secret pattern found."
echo "Next: RUNBOOK.md section 5 (first commit to the private repository)."

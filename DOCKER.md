# Docker — Organic Posts

Run the project anywhere with Docker, share with testers/colleagues without exposing your dev machine.

---

## TL;DR

```bash
# 1. Configure secrets
cp .env.docker.example .env
# (edit .env — RESEND_API_KEY is the only required one for the landing demo)

# 2a. Landing page only (most common — share the marketing site)
docker compose up web --build
open http://localhost:3000

# 2b. Full stack (web + api + worker + postgres + redis)
docker compose --profile full up --build
open http://localhost:3000
```

---

## Two modes

### 1. Landing-only mode (default)

For showing the marketing site to testers, prospects, investors. No DB needed.

```bash
docker compose up web
```

- Web on `http://localhost:3000`
- Image size: ~150 MB
- Waitlist form posts to `/api/waitlist` (Next.js API route, requires `RESEND_API_KEY`)

### 2. Full stack mode (`--profile full`)

For testers using the actual product (post drafting, scheduling, etc.). Brings up Postgres, Redis, API, Worker.

```bash
docker compose --profile full up
```

- Web on `http://localhost:3000`
- API on `http://localhost:3001`
- Postgres on `localhost:5432` (user `op`, db `organicposts`)
- Redis on `localhost:6379`

---

## Sharing with others

### Option A: ship the image (private demo)

```bash
# Build
docker build -f apps/web/Dockerfile -t organicposts/web:demo .

# Tag for Docker Hub or any registry
docker tag organicposts/web:demo yourhub/organicposts-web:demo

# Push
docker push yourhub/organicposts-web:demo
```

Recipient runs:
```bash
docker run -p 3000:3000 -e RESEND_API_KEY=xxx yourhub/organicposts-web:demo
```

### Option B: ngrok / Cloudflare Tunnel (live demo on your machine)

```bash
# After docker compose up web, expose port 3000:
ngrok http 3000
# or
cloudflared tunnel --url http://localhost:3000
```

You get a public HTTPS URL you can text/email to anyone.

### Option C: deploy to Railway / Fly.io / Render (recommended for real launch)

Push the same Dockerfile. Each provider auto-detects it. See **Go-Live overview** below.

---

## Build matrix

| Image | Built from | Size (approx) | Purpose |
|---|---|---|---|
| `organicposts/web` | `apps/web/Dockerfile` | ~150 MB | Next.js standalone runtime |
| `organicposts/api` | `apps/api/Dockerfile` | ~140 MB | Hono REST API |
| `organicposts/worker` | `apps/worker/Dockerfile` | ~140 MB | BullMQ job consumer |

All run as non-root user (uid 1001), production NODE_ENV, no source maps.

---

## Common commands

```bash
# Rebuild after code change
docker compose up web --build

# Tail logs
docker compose logs -f web

# Stop everything
docker compose down

# Stop AND wipe volumes (Postgres data, Redis data) — destructive
docker compose down -v

# Shell into running web container
docker compose exec web sh

# Connect to Postgres
docker compose --profile full exec postgres psql -U op organicposts

# Connect to Redis
docker compose --profile full exec redis redis-cli
```

---

## Troubleshooting

- **Port 3000 already in use** → another Next.js dev server running. `lsof -ti:3000 | xargs kill -9` or change the host port in `docker-compose.yml`.
- **Build fails on `npm ci`** → check `package-lock.json` is committed and not corrupted. Run `rm -rf node_modules && npm install` locally first to regenerate.
- **Waitlist form returns 500** → `RESEND_API_KEY` is missing or invalid in `.env`. Restart with `docker compose up web --force-recreate`.
- **Unsplash background images not loading in dark mode** → check the CSP `img-src` in `apps/web/next.config.js` includes `https://images.unsplash.com` (already added in this build).
- **CORS errors when hitting the API** → web and api must share an origin in production, or you must add CORS allowlist on the api side. For local docker-compose, both run on `localhost` so this is fine.

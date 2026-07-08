# syntax=docker/dockerfile:1.7
#
# Organic Posts — API (Hono) production image
# ============================================
# Build from REPO ROOT:
#   docker build -f apps/api/Dockerfile -t organicposts/api .

# ───────────────────────────────────────────── 1. deps
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* turbo.json* ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages ./packages
RUN npm ci --workspaces --include-workspace-root --legacy-peer-deps

# ───────────────────────────────────────────── 2. builder
FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN npm run build --workspace=@organic-posts/api

# ───────────────────────────────────────────── 3. runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3001

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 --ingroup nodejs hono

# Prod-only deps in the runner
COPY --from=builder --chown=hono:nodejs /app/apps/api/package.json ./package.json
COPY --from=builder --chown=hono:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=hono:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=hono:nodejs /app/packages ./packages
# Gated download assets (served only via /api/download with a signed token).
COPY --from=builder --chown=hono:nodejs /app/apps/api/assets ./assets

USER hono
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/healthz || exit 1

# rootDir spans the monorepo, so tsc preserves paths: entry is nested.
CMD ["node", "dist/apps/api/src/index.js"]

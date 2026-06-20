# syntax=docker/dockerfile:1.7
#
# Organic Posts — Worker (BullMQ) production image
# Build from REPO ROOT:
#   docker build -f apps/worker/Dockerfile -t organicposts/worker .

FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* turbo.json* ./
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages ./packages
RUN npm ci --workspaces --include-workspace-root --legacy-peer-deps

FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN npm run build --workspace=@organic-posts/worker

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 --ingroup nodejs worker

COPY --from=builder --chown=worker:nodejs /app/apps/worker/package.json ./package.json
COPY --from=builder --chown=worker:nodejs /app/apps/worker/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/packages ./packages

USER worker

# No port exposed — worker only consumes the queue.
# rootDir spans the monorepo, so tsc preserves paths: entry is nested.
CMD ["node", "dist/apps/worker/src/index.js"]

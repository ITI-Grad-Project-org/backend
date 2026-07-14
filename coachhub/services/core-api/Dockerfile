# syntax=docker/dockerfile:1.7

# ── Stage 1: install all deps (incl. dev — needed to compile TS) ──────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: compile TS → dist. Dev deps stay installed: this stage is also
#    the hot-reload target of docker-compose.override.yml (needs nest CLI). ──
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Stage 3: strip dev deps (separate stage so `build` keeps them) ──────────
FROM build AS prune
RUN npm prune --omit=dev

# ── Stage 4: minimal runtime, non-root ─────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
USER node
COPY --chown=node:node --from=prune /app/node_modules ./node_modules
COPY --chown=node:node --from=prune /app/dist         ./dist
COPY --chown=node:node --from=prune /app/package.json ./package.json
EXPOSE 3000
# Same image runs migrations: node node_modules/typeorm/cli.js migration:run -d dist/data-source.js
CMD ["node", "dist/main"]

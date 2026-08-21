# CoachHub — Docker Deployment

> Deliverable 2 of 4. See [System architecture](01-system-architecture.md) for topology and
> event contracts. File paths below are relative to the repo root (`coachhub/`).

> **Implemented (2026-07-10) — the canonical files now live in the repo** and are the source
> of truth over the snippets below: `services/*/Dockerfile` + `.dockerignore`, root
> `docker-compose.yml`, `docker-compose.override.yml`, `.env.example`, and
> `deploy/docker/create-databases.sh`. Ports follow the repo convention
> (**8082 = analytics, 8083 = notification**), images default to an ACR registry
> (`REGISTRY` env, see `.env.example`), and `DB_SYNCHRONIZE=true` is a compose-only dev
> convenience (K8s runs `false` + the migration Job).

**Assumptions (stated once):** Spring services build with **Maven** (`pom.xml` present) and
Spring Boot ≥ 3.2 (loader class `org.springframework.boot.loader.launch.JarLauncher`; for
3.0/3.1 use `org.springframework.boot.loader.JarLauncher`). core-api compiles to `dist/` with a
TypeORM data source at `dist/data-source.js` (npm scripts: `migration:generate/run/revert`).

## 1. Layout of Docker assets

```
coachhub/
├── docker-compose.yml
├── docker-compose.override.yml        # dev-only, auto-merged by `docker compose up`
├── .env.example                       # copy to .env, never commit .env
├── deploy/docker/
│   └── create-databases.sh            # Postgres init (creates DBs + roles)
└── services/
    ├── core-api/{Dockerfile,.dockerignore}
    ├── ai-service/{Dockerfile,.dockerignore}
    ├── analytics-service/{Dockerfile,.dockerignore}
    └── notification-service/{Dockerfile,.dockerignore}
```

## 2. Postgres init script (REQUIRED — do not omit)

TypeORM (and Hibernate) only manage **schema inside an existing database** — neither can create
databases or roles. This script runs from `/docker-entrypoint-initdb.d/` **once, on first
initialization of an empty data volume**, before any app connects.

It is a `.sh` rather than a `.sql` for one reason only: the official `postgres` image executes
shell scripts with the container's environment, letting passwords come from env/secrets instead
of being hardcoded in SQL. (The image runs both `.sh` and `.sql` files from that directory.)

`deploy/docker/create-databases.sh`:

```sh
#!/bin/sh
# Creates the two logical databases and their owners.
# Runs ONLY on first init of an empty PGDATA volume (docker-entrypoint-initdb.d contract).
# Requires: CORE_DB_PASSWORD, ANALYTICS_DB_PASSWORD in the container environment.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER core_user      WITH PASSWORD '${CORE_DB_PASSWORD}';
    CREATE USER analytics_user WITH PASSWORD '${ANALYTICS_DB_PASSWORD}';

    CREATE DATABASE core_db      OWNER core_user;
    CREATE DATABASE analytics_db OWNER analytics_user;

    -- No cross-database access: each user may connect only to its own DB.
    REVOKE CONNECT ON DATABASE core_db      FROM PUBLIC;
    REVOKE CONNECT ON DATABASE analytics_db FROM PUBLIC;
    GRANT  CONNECT ON DATABASE core_db      TO core_user;
    GRANT  CONNECT ON DATABASE analytics_db TO analytics_user;
EOSQL

# Postgres 15+: 'public' schema is no longer world-writable; make each owner explicit.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname core_db <<-EOSQL
    ALTER SCHEMA public OWNER TO core_user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname analytics_db <<-EOSQL
    ALTER SCHEMA public OWNER TO analytics_user;
EOSQL
```

> If the volume already exists the script will NOT re-run. To re-init in dev:
> `docker compose down -v` (destroys data).

### 2.1 Repairing an existing volume

A volume created before analytics-service was pointed at `core_db` never received
the `analytics_user` grants, so every analytics request fails with:

```
FATAL: permission denied for database "core_db"
DETAIL: User does not have CONNECT privilege.
```

Note that this reaches the client as `bad SQL grammar`, not as anything
mentioning permissions: Spring maps SQLState `42501` (insufficient privilege) and
`42703` (undefined column) to the same `BadSqlGrammarException`, so a missing
grant and a missing column look nearly identical. Check the grants before
concluding the schema is out of date.

`docker compose down -v` fixes it by destroying all local data. To keep the data:

```bash
sh deploy/docker/repair-analytics-grants.sh
```

This is the dev counterpart to `deploy/k8s/30-migrations/analytics-grants-job.yaml`.
It brings an existing volume up to what `create-databases.sh` would have produced,
verifies the result, and is a no-op on a database that is already correct.

## 3. Dockerfiles

### 3.1 core-api (NestJS) — `services/core-api/Dockerfile`

Multi-stage, `node:22-alpine`, non-root (`node` user ships with the image), prod deps only.

```dockerfile
# syntax=docker/dockerfile:1.7

# ── Stage 1: install all deps (incl. dev) ────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: compile TS → dist, then strip dev deps ──────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

# ── Stage 3: minimal runtime, non-root ────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
USER node
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist         ./dist
COPY --chown=node:node --from=build /app/package.json ./package.json
EXPOSE 3000
# dist is also the migration image: node node_modules/typeorm/cli.js migration:run -d dist/data-source.js
CMD ["node", "dist/main.js"]
```

`services/core-api/.dockerignore`:

```
node_modules
dist
coverage
.git
.env*
*.md
Dockerfile*
docker-compose*
.eslintrc*
.prettierrc*
test
```

### 3.2 Spring services (reusable) — `services/<svc>/Dockerfile`

**One identical Dockerfile for all three** Spring services (build context = the service dir, so
no per-service edits needed). Layered-JAR extraction means dependency layers are cached across
rebuilds; only the `application` layer changes on code edits. `-XX:MaxRAMPercentage` sizes the
heap from the container memory limit instead of a fixed `-Xmx`.

```dockerfile
# syntax=docker/dockerfile:1.7

# ── Stage 1: build (Maven cache mounted, deps resolved before source copy) ─
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q package -DskipTests

# ── Stage 2: explode Boot layered JAR ─────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS layers
WORKDIR /layers
COPY --from=build /workspace/target/*.jar app.jar
RUN java -Djarmode=layertools -jar app.jar extract

# ── Stage 3: runtime, non-root, layer-ordered for cache reuse ─────────────
FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S spring && adduser -S spring -G spring
USER spring
WORKDIR /app
COPY --from=layers /layers/dependencies/          ./
COPY --from=layers /layers/spring-boot-loader/    ./
COPY --from=layers /layers/snapshot-dependencies/ ./
COPY --from=layers /layers/application/           ./
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"
# Spring Boot >= 3.2. For 3.0/3.1 use org.springframework.boot.loader.JarLauncher
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
```

`services/<svc>/.dockerignore` (same for all three):

```
target
.git
.mvn/wrapper/*.jar
*.md
Dockerfile*
docker-compose*
.idea
*.iml
```

## 4. `docker-compose.yml` (repo root)

Complete stack: Postgres (+init script), RabbitMQ (management UI), Redis, MailHog, all 4 apps.
Every dependency uses `condition: service_healthy` so apps start only when infra is actually
ready. Image tags are pinned; app images are also tagged so `docker compose push` yields
immutable, registry-ready tags via `IMAGE_TAG` (never `:latest`).

```yaml
name: coachhub

networks:
  coachhub-net:
    driver: bridge

volumes:
  postgres-data:
  rabbitmq-data:

services:
  # ── Infrastructure ───────────────────────────────────────────────────────
  postgres:
    image: postgres:16.4-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_SUPERUSER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_SUPERUSER_PASSWORD:?set in .env}
      POSTGRES_DB: postgres
      CORE_DB_PASSWORD: ${CORE_DB_PASSWORD:?set in .env}
      ANALYTICS_DB_PASSWORD: ${ANALYTICS_DB_PASSWORD:?set in .env}
    ports:
      - "5433:5432"            # host 5433 avoids clashing with a local Postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./deploy/docker/create-databases.sh:/docker-entrypoint-initdb.d/10-create-databases.sh:ro
    networks: [coachhub-net]
    healthcheck:
      # -d core_db: ready only after the init script has created the app DBs
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_SUPERUSER:-postgres} -d core_db"]
      interval: 5s
      timeout: 5s
      retries: 12

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-coachhub}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD:?set in .env}
    ports:
      - "5672:5672"
      - "15672:15672"          # management UI → http://localhost:15672
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    networks: [coachhub-net]
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 6

  redis:
    image: redis:7.4-alpine
    command: ["redis-server", "--maxmemory", "256mb", "--maxmemory-policy", "allkeys-lru"]
    ports:
      - "6379:6379"
    networks: [coachhub-net]   # disposable cache: deliberately NO volume
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 6

  mailhog:
    image: mailhog/mailhog:v1.0.1
    ports:
      - "1025:1025"            # SMTP
      - "8025:8025"            # Web UI → http://localhost:8025
    networks: [coachhub-net]

  # ── Applications ─────────────────────────────────────────────────────────
  core-api:
    build:
      context: ./services/core-api
    image: ghcr.io/${ORG:-coachhub}/core-api:${IMAGE_TAG:-dev}
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://core_user:${CORE_DB_PASSWORD}@postgres:5432/core_db
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://${RABBITMQ_USER:-coachhub}:${RABBITMQ_PASSWORD}@rabbitmq:5672
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:?set in .env}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:?set in .env}
      JWT_ACCESS_EXPIRES_IN: ${JWT_ACCESS_EXPIRES_IN:-7d}
      JWT_REFRESH_EXPIRES_IN: ${JWT_REFRESH_EXPIRES_IN:-30d}
      FRONTEND_URL: ${FRONTEND_URL:-http://localhost:5173}
    ports:
      - "3000:3000"
    depends_on:
      postgres:  { condition: service_healthy }
      rabbitmq:  { condition: service_healthy }
      redis:     { condition: service_healthy }
    networks: [coachhub-net]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s

  ai-service:
    build:
      context: ./services/ai-service
    image: ghcr.io/${ORG:-coachhub}/ai-service:${IMAGE_TAG:-dev}
    environment:
      SERVER_PORT: 8081
      SPRING_DATA_MONGODB_URI: ${MONGODB_ATLAS_URI:?set in .env}   # managed Atlas — URI only
      SPRING_RABBITMQ_HOST: rabbitmq
      SPRING_RABBITMQ_USERNAME: ${RABBITMQ_USER:-coachhub}
      SPRING_RABBITMQ_PASSWORD: ${RABBITMQ_PASSWORD}
      GEMINI_API_KEY: ${GEMINI_API_KEY:?set in .env}
    ports:
      - "8081:8081"
    depends_on:
      rabbitmq: { condition: service_healthy }
    networks: [coachhub-net]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8081/actuator/health/readiness"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 40s

  notification-service:
    build:
      context: ./services/notification-service
    image: ghcr.io/${ORG:-coachhub}/notification-service:${IMAGE_TAG:-dev}
    environment:
      SERVER_PORT: 8082
      SPRING_RABBITMQ_HOST: rabbitmq
      SPRING_RABBITMQ_USERNAME: ${RABBITMQ_USER:-coachhub}
      SPRING_RABBITMQ_PASSWORD: ${RABBITMQ_PASSWORD}
      MAIL_PROVIDER: ${MAIL_PROVIDER:-mailhog}     # mailhog (dev) | resend (prod)
      MAIL_HOST: ${MAIL_HOST:-mailhog}
      MAIL_PORT: ${MAIL_PORT:-1025}
      RESEND_API_KEY: ${RESEND_API_KEY:-}
      MAIL_FROM: ${MAIL_FROM:-no-reply@coachhub.local}
    ports:
      - "8082:8082"
    depends_on:
      rabbitmq: { condition: service_healthy }
      mailhog:  { condition: service_started }
    networks: [coachhub-net]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8082/actuator/health/readiness"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 40s

  analytics-service:
    build:
      context: ./services/analytics-service
    image: ghcr.io/${ORG:-coachhub}/analytics-service:${IMAGE_TAG:-dev}
    environment:
      SERVER_PORT: 8083
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/analytics_db
      SPRING_DATASOURCE_USERNAME: analytics_user
      SPRING_DATASOURCE_PASSWORD: ${ANALYTICS_DB_PASSWORD}
      SPRING_RABBITMQ_HOST: rabbitmq
      SPRING_RABBITMQ_USERNAME: ${RABBITMQ_USER:-coachhub}
      SPRING_RABBITMQ_PASSWORD: ${RABBITMQ_PASSWORD}
    ports:
      - "8083:8083"
    depends_on:
      postgres: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }
    networks: [coachhub-net]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8083/actuator/health/readiness"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 40s
```

Notes:

- `:?set in .env` makes compose **fail fast** on missing secrets instead of booting with
  `changeme` defaults.
- The Postgres healthcheck probes `core_db`, not the superuser DB — dependents wait until the
  init script has actually finished.
- TypeORM migrations in Docker: run them explicitly after infra is up (see cheat sheet §7) —
  `synchronize: false` always; compose's `depends_on` is *not* a migration mechanism.

## 5. `.env.example` (repo root)

Copy to `.env` and fill in. **Never commit `.env`.**

```dotenv
# ── Registry / images ────────────────────────────────────────────────────
ORG=coachhub
IMAGE_TAG=dev                      # CI sets this to the git SHA or semver

# ── PostgreSQL ───────────────────────────────────────────────────────────
POSTGRES_SUPERUSER=postgres
POSTGRES_SUPERUSER_PASSWORD=change-me-superuser
CORE_DB_PASSWORD=change-me-core
ANALYTICS_DB_PASSWORD=change-me-analytics

# ── RabbitMQ ─────────────────────────────────────────────────────────────
RABBITMQ_USER=coachhub
RABBITMQ_PASSWORD=change-me-rabbit

# ── core-api ─────────────────────────────────────────────────────────────
JWT_ACCESS_SECRET=change-me-32-bytes-min
JWT_REFRESH_SECRET=change-me-32-bytes-min
JWT_ACCESS_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
FRONTEND_URL=http://localhost:5173

# ── ai-service ───────────────────────────────────────────────────────────
MONGODB_ATLAS_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/coachhub-rag?retryWrites=true
GEMINI_API_KEY=change-me

# ── notification-service ─────────────────────────────────────────────────
MAIL_PROVIDER=mailhog              # mailhog (dev) | resend (prod)
MAIL_HOST=mailhog
MAIL_PORT=1025
RESEND_API_KEY=
MAIL_FROM=no-reply@coachhub.local
```

> ⚠️ The current repo's `docker-compose.yml` has a live Atlas URI with credentials committed as
> a default. **Rotate that password** and move the URI to `.env` — treat it as leaked.

## 6. `docker-compose.override.yml` (dev hot reload)

Auto-merged by `docker compose up` when present; **do not deploy it**. core-api runs the `build`
stage with the source bind-mounted and Nest's watcher; Spring services get remote-debug ports
(hot-swap via your IDE — Java hot reload inside Docker is not worth the complexity; iterate on
Spring locally against the compose infra instead).

```yaml
services:
  core-api:
    build:
      context: ./services/core-api
      target: build              # dev deps still present in this stage
    command: ["npm", "run", "start:dev"]
    environment:
      NODE_ENV: development
    volumes:
      - ./services/core-api/src:/app/src:cached
      - ./services/core-api/tsconfig.json:/app/tsconfig.json:ro
      - ./services/core-api/nest-cli.json:/app/nest-cli.json:ro

  ai-service:
    environment:
      JAVA_TOOL_OPTIONS: >-
        -XX:MaxRAMPercentage=75.0
        -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
    ports:
      - "5005:5005"

  notification-service:
    environment:
      JAVA_TOOL_OPTIONS: >-
        -XX:MaxRAMPercentage=75.0
        -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5006
    ports:
      - "5006:5006"

  analytics-service:
    environment:
      JAVA_TOOL_OPTIONS: >-
        -XX:MaxRAMPercentage=75.0
        -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5007
    ports:
      - "5007:5007"
```

## 7. Command cheat sheet

| Task | Command |
|---|---|
| First run | `cp .env.example .env` → edit → `docker compose up -d --build` |
| Infra only (local app dev) | `docker compose up -d postgres rabbitmq redis mailhog` |
| Run TypeORM migrations | `docker compose run --rm core-api node node_modules/typeorm/cli.js migration:run -d dist/data-source.js` |
| Tail one service | `docker compose logs -f core-api` |
| Rebuild one service | `docker compose up -d --build ai-service` |
| Prod-style up (no override) | `docker compose -f docker-compose.yml up -d` |
| Status + health | `docker compose ps` |
| psql into core_db | `docker compose exec postgres psql -U core_user -d core_db` |
| RabbitMQ UI / MailHog UI | `http://localhost:15672` / `http://localhost:8025` |
| Stop | `docker compose down` |
| Stop + wipe data (re-runs init SQL) | `docker compose down -v` |
| Push images (CI) | `IMAGE_TAG=$(git rev-parse --short HEAD) docker compose build && docker compose push` |

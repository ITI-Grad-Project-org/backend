# CoachHub Backend

CoachHub is a multi-tenant coaching platform built as a polyglot microservices system.

## Services

| Service | Stack | Database | Port |
|---|---|---|---|
| core-api | NestJS + TypeORM | PostgreSQL `core_db` (+ Redis cache) | 3000 |
| ai-service | Spring Boot | MongoDB Atlas (managed, URI only) | 8081 |
| analytics-service | Spring Boot | PostgreSQL `analytics_db` | 8082 |
| notification-service | Spring Boot | — (stateless) | 8083 |

Services communicate asynchronously over **RabbitMQ** (topic exchange
`coachhub.events`, one durable queue + DLQ per consumer). core-api is the only
client-facing service. See `contracts/` for event definitions and
`docs/deployment/` for the full architecture docs.

## Folder structure

```
coachhub/
  services/
    core-api/           # NestJS public API
    ai-service/         # Gemini + RAG AI assistant
    analytics-service/  # Dashboard read model
    notification-service/ # Email + in-app notifications
  deploy/
    k8s/                # Kubernetes manifests (AKS-ready) — see deploy/k8s/README.md
    docker/             # Shared docker assets (Postgres init script)
  docs/deployment/      # Architecture + Docker + K8s + Azure runbook
  contracts/            # Message envelope & event stubs
  docker-compose.yml    # Full local stack (infra + all 4 services)
  docker-compose.override.yml  # Dev hot-reload overrides (auto-merged)
  .env.example          # Copy to .env and fill in — never commit .env
```

## Local development

```bash
cp .env.example .env    # fill in the change-me values
docker compose up -d --build          # full stack with hot reload for core-api
# or infra only, then run services from your IDE:
docker compose up -d postgres rabbitmq redis mailhog
```

- API: http://localhost:3000 (Swagger: `/api/docs`, health: `/health`)
- RabbitMQ UI: http://localhost:15672 · MailHog UI: http://localhost:8025
- Postgres on host port **5433** (`core_db` / `analytics_db` are created by
  `deploy/docker/create-databases.sh` on first start; `docker compose down -v` re-inits)

MongoDB is **not** run locally — ai-service always uses a MongoDB Atlas URI
(Atlas Vector Search is required; set `MONGODB_ATLAS_URI` in `.env`).

## Deployment

- Docker images: multi-stage, non-root — `services/*/Dockerfile`
- Kubernetes (Azure AKS + ACR): `deploy/k8s/` — apply order in `deploy/k8s/README.md`
- Full Azure runbook: `docs/deployment/05-azure-deployment.md`
- core-api schema in production: TypeORM migrations only
  (`DB_SYNCHRONIZE=false` + the `core-api-migrations` Job); `synchronize` is a
  dev-only convenience.

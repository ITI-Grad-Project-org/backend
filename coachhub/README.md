# CoachHub Backend

CoachHub is a multi-tenant coaching platform built as a polyglot microservices system.

## Services

| Service | Stack | Database | Port |
|---|---|---|---|
| core-api | NestJS + Prisma | PostgreSQL | 3000 |
| ai-service | Spring Boot | MongoDB | 8081 |
| analytics-service | Spring Boot | PostgreSQL | 8082 |
| notification-service | Spring Boot | — (stateless) | 8083 |

Services communicate asynchronously over **RabbitMQ**. See `contracts/` for event definitions.

## Folder structure

```
coachhub/
  services/
    core-api/           # NestJS public API
    ai-service/         # Gemini + RAG AI assistant
    analytics-service/  # Dashboard read model
    notification-service/ # Email + in-app notifications
  deploy/
    k8s/                # Kubernetes manifest skeletons
    docker/             # Shared docker assets
  contracts/            # Message envelope & event stubs
  docker-compose.yml    # Local infra
```

## Local development

Bring up infrastructure (Postgres, MongoDB, RabbitMQ):

```bash
docker-compose up -d postgres mongodb rabbitmq
```

Then start each service individually following its own `README.md`.

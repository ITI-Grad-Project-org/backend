# core-api

NestJS public REST API for CoachHub. Handles auth, tenants, clients, training/nutrition plans, check-ins, and coach↔client messaging.

## Stack
- NestJS 10 / TypeScript
- PostgreSQL via TypeORM
- RabbitMQ for async domain events

## Running locally

```bash
cp .env.example .env
npm install
npm run start:dev
```

Health endpoint: `GET /health`

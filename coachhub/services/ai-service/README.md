# CoachHub — AI Service

The AI assistant microservice for CoachHub. It listens for `ai.requested` events,
generates a response with **Google Gemini** grounded by a **RAG** knowledge base
(MongoDB Atlas Vector Search), stores the request/result in MongoDB, and emits an
`ai.completed` event for downstream services.

> Looking for diagrams and the deep request walkthrough? See
> [`ARCHITECTURE.md`](./ARCHITECTURE.md). This README is the practical guide:
> what it is, how to configure it, and how to run it.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Tech stack](#2-tech-stack)
3. [How it works (the flow)](#3-how-it-works-the-flow)
4. [Project layout](#4-project-layout)
5. [Event contract](#5-event-contract)
6. [RAG design](#6-rag-design)
7. [Configuration reference](#7-configuration-reference)
8. [Running locally](#8-running-locally)
9. [MongoDB Atlas setup](#9-mongodb-atlas-setup)
10. [Resilience & failure handling](#10-resilience--failure-handling)
11. [Troubleshooting](#11-troubleshooting)
12. [Security notes](#12-security-notes)
13. [Known gaps / TODO](#13-known-gaps--todo)

---

## 1. What it does

- **Consumes** `ai.requested` from the shared RabbitMQ topic exchange.
- **Retrieves** the most relevant coaching knowledge (RAG) for the prompt.
- **Generates** an answer with Gemini using a context-grounded prompt.
- **Persists** every request and its result/status in MongoDB.
- **Publishes** `ai.completed` (`succeeded` or `failed`) for
  `notification-service` and `analytics-service`.

It is **event-driven** — there is no synchronous business REST API (only actuator
`health`/`info` on port `8081`).

---

## 2. Tech stack

| Concern        | Choice                                                        |
| -------------- | ------------------------------------------------------------- |
| Runtime        | Spring Boot 3.5.x · Java 21                                    |
| Messaging      | RabbitMQ (topic exchange `coachhub.events`)                   |
| AI — chat      | Google Gemini via a hand-rolled `RestClient`                  |
| AI — embeddings| Spring AI 1.1.x Google GenAI (`gemini-embedding-001`)         |
| RAG store      | **MongoDB Atlas Vector Search**                               |
| Database       | MongoDB (request log `ai_requests`)                           |
| Build          | Maven (multi-stage Docker, Temurin 21)                        |

---

## 3. How it works (the flow)

```
ai.requested ─▶ EventListener ─▶ GeminiService.process
                                   │
                                   ├─ findByRequestId  (idempotency)
                                   ├─ save AiDocument  (PROCESSING)
                                   ├─ RagService.retrieve(prompt, 4)   ── MongoDB Atlas $vectorSearch
                                   ├─ build grounded prompt
                                   ├─ GeminiClient.generate(prompt)    ── Google Gemini API
                                   ├─ markSucceeded / markFailed + save
                                   └─ EventPublisher.publish("ai.completed", …) ─▶ notification / analytics
```

- **`EventListener`** matches `messageType == "ai.requested"` and deserializes the
  envelope's payload into `AiRequestedPayload`.
- **`GeminiService`** is the orchestrator (idempotency → persist → retrieve →
  generate → persist → publish).
- **`GeminiClient`** POSTs to `…/models/{model}:generateContent` with the
  `x-goog-api-key` header and returns the first candidate's text.
- **`EventPublisher`** wraps the payload in the shared envelope and routes it with
  **`messageType` as the routing key** (`ai.completed`).

Full sequence diagram + failure branch: [`ARCHITECTURE.md` §4](./ARCHITECTURE.md).

---

## 4. Project layout

```
src/main/java/com/coachhub/ai/
├── AiServiceApplication.java         # Spring Boot entry point
├── config/
│   ├── MongoConfig.java              # @EnableMongoRepositories(com.coachhub.ai)
│   └── RabbitMqConfig.java           # exchange, queue, DLX/DLQ, JSON converter
├── domain/
│   ├── AiDocument.java               # Mongo doc (ai_requests) + lifecycle
│   └── AiRequestRepository.java      # MongoRepository + findByRequestId
├── rabbitmq/
│   ├── EventEnvelope.java            # shared message envelope (record)
│   ├── EventListener.java            # @RabbitListener on ai.q
│   ├── EventPublisher.java           # publishes ai.completed
│   └── payload/
│       ├── AiRequestedPayload.java   # inbound payload
│       └── AiCompletedPayload.java   # outbound payload
└── service/
    ├── gemini/GeminiService.java     # orchestrator
    ├── client/
    │   ├── GeminiClient.java         # REST call to Gemini
    │   └── GeminiDtos.java           # request/response records
    └── rag/
        ├── RagService.java           # retrieval interface
        ├── SpringAiRagService.java   # Atlas $vectorSearch impl
        ├── RagChunk.java             # (text, source, score) record
        └── KnowledgeBaseSeeder.java  # one-time KB seeding at startup

src/main/resources/
├── application.yml                   # committed config (env-var driven)
└── application-local.yml             # GITIGNORED — Atlas URI + Gemini key
```

The `VectorStore` bean is **not** hand-written — it is autoconfigured as a
`MongoDBAtlasVectorStore` from `spring.ai.vectorstore.mongodb.*`.

---

## 5. Event contract

Every message on `coachhub.events` is the shared envelope from
`contracts/events.json`. **`messageType` doubles as the topic routing key.**

```json
{
  "tenantId":      "uuid",
  "correlationId": "uuid",
  "messageType":   "ai.requested",
  "timestamp":     "ISO-8601",
  "schemaVersion": "1.0.0",
  "payload":       { }
}
```

| Event          | Dir | Payload fields                                              |
| -------------- | --- | ---------------------------------------------------------- |
| `ai.requested` | in  | `requestId, clientId, coachId, kind, prompt`               |
| `ai.completed` | out | `requestId, clientId, coachId, coachEmail, status, summary`|

> ⚠️ The contract's `ai.requested` payload has **no `coachEmail`**, but
> `ai.completed` needs it. Until core-api adds it, `coachEmail` is forwarded as
> `null`. (Deferred — depends on the core-api binding.)

---

## 6. RAG design

- **Store:** MongoDB Atlas Vector Search. The collection is `rag_knowledge`, the
  vector index is `vector_index`, and the embedding field is `embedding`.
- **Schema creation:** `initialize-schema: true` creates the collection **and**
  the Atlas vector index at startup. The index `numDimensions` is read
  **automatically from the embedding model**, so it always matches Gemini — no
  manual dimension tuning.
- **Seeding:** `KnowledgeBaseSeeder` loads the starter coaching docs **once**. It
  counts the collection and skips if already populated (the store is persistent —
  re-seeding every boot would duplicate chunks).
- **Retrieval:** `SpringAiRagService.retrieve(query, topK)` runs `$vectorSearch`
  and returns `List<RagChunk>`; `GeminiService` prepends the top 4 chunks to the
  prompt as context.
- **Fail-soft:** both seeding and retrieval swallow errors — a bad key / network
  blip degrades RAG to "no context" rather than crashing the request or startup.

> **Atlas is required.** `$vectorSearch` only exists on MongoDB Atlas (cloud) or
> the `mongodb/mongodb-atlas-local` image — **not** the community `mongo:7`
> server.

---

## 7. Configuration reference

All settings live in `application.yml` and are driven by environment variables.

### Environment variables

| Variable                    | Default                          | Purpose                                   |
| --------------------------- | -------------------------------- | ----------------------------------------- |
| `SPRING_DATA_MONGODB_URI`   | local docker mongo               | MongoDB / Atlas connection string         |
| `GEMINI_API_KEY`            | `changeme`                       | Gemini key (chat **and** embeddings)      |
| `GEMINI_MODEL`              | `gemini-2.5-flash`               | Gemini chat model                         |
| `GEMINI_EMBEDDING_MODEL`    | `gemini-embedding-001`           | Embedding model                           |
| `GEMINI_BASE_URL`           | `…/v1beta`                       | Gemini API base URL                       |
| `RAG_COLLECTION`            | `rag_knowledge`                  | Vector collection name                    |
| `RAG_INDEX`                 | `vector_index`                   | Atlas vector index name                   |
| `RAG_SEED_ON_STARTUP`       | `true`                           | Seed KB at startup (set `false` in tests) |
| `SPRING_RABBITMQ_HOST`      | `localhost`                      | RabbitMQ host                             |
| `SPRING_RABBITMQ_PORT`      | `5672`                           | RabbitMQ port                             |
| `SPRING_RABBITMQ_USERNAME`  | `coachhub`                       | RabbitMQ user                             |
| `SPRING_RABBITMQ_PASSWORD`  | `secret`                         | RabbitMQ password                         |

### Notable fixed settings

- `spring.data.mongodb.auto-index-creation: true` — needed so the
  `@Indexed(unique=true)` on `requestId` is actually created.
- `spring.rabbitmq.listener.simple.retry` — 3 attempts, 2s → ×2 → max 10s.
- `default-requeue-rejected: false` — exhausted infra/parse errors go to the DLQ,
  not an infinite loop.

---

## 8. Running locally

### Prerequisites

- JDK 21 and Maven
- A **MongoDB Atlas** cluster (or the Atlas Local image) — see §9
- A valid **Gemini API key**
- RabbitMQ (the bundled `docker-compose.yml` provides one)

### Secrets — the `local` profile

The Atlas URI and Gemini key live in **`application-local.yml`**, which is
**gitignored** (never committed). Activate the `local` profile to load it:

```bash
# fill in application-local.yml (URI + key) first, then:
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

…or set `SPRING_PROFILES_ACTIVE=local` in your IDE run configuration. You can
also export the values instead of using the file:

```bash
export SPRING_DATA_MONGODB_URI="mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/spring-rag-service?appName=Cluster0"
export GEMINI_API_KEY="your-real-key"
mvn spring-boot:run
```

### Start RabbitMQ (and optional local Mongo)

```bash
docker compose up -d rabbitmq
```

### Verify it's up

```bash
curl http://localhost:8081/actuator/health   # -> {"status":"UP", ...}
```

### Docker

```bash
docker compose up --build         # builds the multi-stage image and runs it
```

> The bundled `mongo:7` service is community MongoDB and does **not** support
> vector search. For RAG you must point `SPRING_DATA_MONGODB_URI` at Atlas (or
> swap the compose image for `mongodb/mongodb-atlas-local`).

---

## 9. MongoDB Atlas setup

1. Create a cluster (the free **M0** tier is fine) and a database user.
2. Allow your IP under **Network Access**.
3. Use the database `spring-rag-service` (already in the connection string).
4. **Vector index** — with `initialize-schema: true` the app creates
   `vector_index` automatically at startup. If your tier/version rejects
   programmatic index creation, set `initialize-schema: false` and create it once
   in the Atlas UI on collection `rag_knowledge`:

   ```json
   {
     "fields": [
       {
         "type": "vector",
         "path": "embedding",
         "numDimensions": 3072,
         "similarity": "cosine"
       },
       { "type": "filter", "path": "metadata.source" }
     ]
   }
   ```

   > `numDimensions` must equal the embedding model's output. `gemini-embedding-001`
   > defaults to **3072**. If you change the embedding model, update this number.

---

## 10. Resilience & failure handling

- **Idempotency** — `process()` looks up `findByRequestId`; if already
  `SUCCEEDED`, it returns early. Redeliveries don't re-call Gemini or re-emit
  events.
- **Generation failure** — any exception is caught → `markFailed(error)` and an
  `ai.completed{status:"failed"}` is published **exactly once**, then the message
  is acked (not rethrown — re-delivery would duplicate events).
- **Listener retry / DLQ** — applies to infra/parse errors *before* `process()`:
  3 retries, then dead-letter to `ai.dlq`.
- **RAG / seeding** — fail-soft; never crash a request or startup.

---

## 11. Troubleshooting

| Symptom                                              | Likely cause / fix                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Startup fails resolving the embedding model dims     | Invalid/`changeme` `GEMINI_API_KEY`, or no network. Set a real key.                |
| `$vectorSearch` / index errors at startup            | Not on Atlas (community `mongo:7`), or tier blocks programmatic index creation.    |
| RAG returns no context (answers feel ungrounded)     | Seeding failed (check warn logs) or index not ready. Re-check key + Atlas index.   |
| `ai.completed` never arrives downstream              | Confirm consumers bind on routing key `ai.completed` (publisher uses messageType). |
| Duplicate KB chunks in `rag_knowledge`               | Seeder skips when the collection is non-empty; clear the collection to re-seed.    |
| Unique-key error on `requestId`                      | Expected idempotency guard on duplicate delivery — safe to ignore.                 |

---

## 12. Security notes

- **Never commit secrets.** The Atlas URI and Gemini key belong in the gitignored
  `application-local.yml` (or env vars), not in `application.yml`.
- If a credential is ever exposed (e.g. pasted in chat/logs), **rotate it** in
  Atlas / Google AI Studio immediately.
- `management.endpoint.health.show-details: always` is fine for dev; consider
  restricting it in production.

---

## 13. Known gaps / TODO

- 🟡 **`coachEmail` not on `ai.requested`** (per contract) yet required on
  `ai.completed` — deferred; depends on the core-api binding.
- ⚪ **No DLQ consumer / alerting** for `ai.dlq`.
- ⚪ **No transient-error retry inside `GeminiClient`** — Gemini failures are
  handled in-service (no broker retry). Add client-side retry if you want
  transient Gemini errors retried.

See [`ARCHITECTURE.md` §8](./ARCHITECTURE.md) for the full fixed-vs-open status.

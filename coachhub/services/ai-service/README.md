# CoachHub — AI Service

The AI assistant microservice for CoachHub. It does two jobs, on two queues:

- **Answers questions** (`ai.requested` → `ai.completed`) with **Google Gemini**,
  grounded by a **RAG** knowledge base (MongoDB Atlas Vector Search).
- **Designs whole programmes** (`ai.plan.requested` → `ai.plan.completed`) —
  a training or nutrition plan for one client, produced as schema-constrained
  JSON and validated before it goes back.

Both store the request and result in MongoDB.

This README is the practical guide: what it is, how it works, how to configure it,
and how to run it.

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

**Answering a question** (`ai.q`):

- **Consumes** `ai.requested` from the shared RabbitMQ topic exchange.
- **Retrieves** the most relevant coaching knowledge (RAG) for the prompt.
- **Generates** an answer with Gemini using a context-grounded prompt.
- **Persists** every request and its result/status in MongoDB.
- **Publishes** `ai.completed` (`succeeded` or `failed`) for
  `notification-service` and `analytics-service`.

**Designing a programme** (`ai.plan.q`):

- **Consumes** `ai.plan.requested`, which carries the client's whole context *and*
  the coach's exercise/meal library — everything generation needs, because the two
  services share no synchronous path to fetch anything that was left out.
- **Generates** one week plus a progression rule, as JSON constrained by a
  `responseSchema`, selecting exercise and meal **ids from the supplied library**.
- **Validates** the result against the constraints core-api's schema enforces.
- **Publishes** `ai.plan.completed` with the plan, its warnings and its token cost
  for `core-api`, which decides whether the suggestion is `ready` or `invalid`.

RAG is used for the first job and not the second. Six semantically similar chunks
are the right answer to "how do I cue a hinge?"; choosing exercises needs the
*complete* set the coach is allowed to pick from, which comes from Postgres in
full on the request itself.

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
                                   ├─ RagService.retrieve(prompt, tenantId, 6)
                                   │     ├─ embed query                ── Gemini embeddings API
                                   │     └─ $vectorSearch + threshold  ── MongoDB Atlas
                                   ├─ build grounded prompt
                                   ├─ GeminiClient.generate(prompt)    ── Google Gemini API
                                   ├─ markSucceeded / markFailed + save
                                   └─ EventPublisher.publish("ai.completed", …) ─▶ notification / analytics

ai.plan.requested ─▶ PlanEventListener ─▶ PlanGenerationService.process
                                   │
                                   ├─ findByRequestId  (idempotency)
                                   ├─ PlanPromptBuilder.build   (client + rules + library)
                                   ├─ PlanResponseSchema.forKind (training | nutrition)
                                   ├─ GeminiClient.generateJson  ── Google Gemini API
                                   ├─ PlanValidator.validate     (ids, day shape, set rules)
                                   ├─ markSucceeded / markFailed + save
                                   └─ EventPublisher.publish("ai.plan.completed", …) ─▶ core-api

  every 30m, on the scheduler (independent of any request):
  KnowledgeIngestService.sync ── core_db (SELECT) + resources/kb ─▶ Atlas vector store
```

- **`EventListener`** matches `messageType == "ai.requested"` and deserializes the
  envelope's payload into `AiRequestedPayload`.
- **`GeminiService`** is the orchestrator (idempotency → persist → retrieve →
  generate → persist → publish).
- **`GeminiClient`** POSTs to `…/models/{model}:generateContent` with the
  `x-goog-api-key` header and returns the first candidate's text.
- **`EventPublisher`** wraps the payload in the shared envelope and routes it with
  **`messageType` as the routing key** (`ai.completed`).

- **`PlanEventListener`** consumes `ai.plan.q`, a **separate queue** from `ai.q`.
  A chat question answers in seconds; a full programme is a long call with a large
  prompt. On one queue every plan would block every question behind it.
- **`PlanPromptBuilder`** supplies what a schema cannot: who the client is, what
  they cannot do, and the rules whose violation makes a plan unsavable.
- **`PlanResponseSchema`** asks for **one week plus a progression rule**, never
  twelve. Generating every week costs roughly eight times the output tokens,
  truncates at `maxOutputTokens`, and produces weeks that drift rather than
  progress. Expanding one week by an explicit rule is arithmetic, and arithmetic
  belongs in code.
- **`PlanValidator`** checks only what core-api's schema would reject —
  `error` — plus a small number of things a coach would want flagged — `warning`.
  It has no opinions about programme quality.

- **`KnowledgeIngestService`** runs on its own schedule, not on the request path.
  Retrieval reads whatever is in Atlas; the ingest is what keeps that current.

---

## 4. Project layout

```
src/main/java/com/coachhub/ai/
├── AiServiceApplication.java         # Spring Boot entry point
├── config/
│   ├── MongoConfig.java              # @EnableMongoRepositories(com.coachhub.ai)
│   ├── GeminiHttpConfig.java         # outbound timeouts (RestClientCustomizer)
│   └── RabbitMqConfig.java           # exchange, queues, DLX/DLQs, JSON converter
├── domain/
│   ├── AiDocument.java               # Mongo doc (ai_requests) + lifecycle
│   └── AiRequestRepository.java      # MongoRepository + findByRequestId
├── rabbitmq/
│   ├── EventEnvelope.java            # shared message envelope (record)
│   ├── EventListener.java            # @RabbitListener on ai.q
│   ├── PlanEventListener.java        # @RabbitListener on ai.plan.q
│   ├── EventPublisher.java           # publishes ai.completed / ai.plan.completed
│   └── payload/
│       ├── AiRequestedPayload.java       # inbound payload
│       ├── AiCompletedPayload.java       # outbound payload
│       ├── AiPlanRequestedPayload.java   # inbound plan request
│       ├── AiPlanCompletedPayload.java   # outbound plan + warnings + cost
│       ├── PlanContext.java              # client profile, intake, constraints
│       ├── PlanCandidates.java           # the ids the model may choose from
│       └── PlanWarning.java              # code / severity / path / message
└── service/
    ├── gemini/GeminiService.java     # question orchestrator
    ├── plan/
    │   ├── PlanGenerationService.java # plan orchestrator
    │   ├── PlanPromptBuilder.java     # context + rules + library → prompt
    │   ├── PlanResponseSchema.java    # Gemini responseSchema per kind
    │   └── PlanValidator.java         # constraint checks → warnings
    ├── client/
    │   ├── GeminiClient.java         # REST call to Gemini
    │   ├── GeminiProperties.java     # base URL, model, timeouts, sampling
    │   ├── GeminiResult.java         # text + finishReason + token usage
    │   └── GeminiDtos.java           # request/response records
    └── rag/
        ├── RagService.java           # retrieval interface + tenant constants
        ├── SpringAiRagService.java   # $vectorSearch + threshold + tenant filter
        ├── RagChunk.java             # (text, source, score) record
        ├── RagProperties.java        # topK, threshold, ingest settings
        └── ingest/
            ├── KnowledgeDocument.java        # chunk + content-hash id
            ├── Phrasing.java                 # DB values → readable prose
            ├── CoreDbKnowledgeReader.java    # six SELECTs against core_db
            ├── CuratedKnowledgeReader.java   # resources/kb/*.md
            ├── KnowledgeIngestService.java   # scheduled diff / upsert / prune
            └── RagIndexVerifier.java         # Atlas index filter-field check

src/main/resources/
├── application.yml                   # committed config (env-var driven)
├── application-local.yml             # GITIGNORED — Atlas URI + Gemini key
└── kb/*.md                           # curated coaching corpus (global tenant)
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

| Event                | Queue       | Dir | Payload fields                                                                        |
| -------------------- | ----------- | --- | ------------------------------------------------------------------------------------- |
| `ai.requested`       | `ai.q`      | in  | `requestId, clientId, coachId, kind, prompt`                                            |
| `ai.completed`       | —           | out | `requestId, clientId, coachId, coachEmail, status, summary`                             |
| `ai.plan.requested`  | `ai.plan.q` | in  | `requestId, suggestionId, membershipId, coachId, kind, context, candidates`             |
| `ai.plan.completed`  | —           | out | `requestId, suggestionId, membershipId, coachId, kind, status, plan, warnings, error, modelMeta` |

> ⚠️ The contract's `ai.requested` payload has **no `coachEmail`**, but
> `ai.completed` needs it. Until core-api adds it, `coachEmail` is forwarded as
> `null`. (Deferred — depends on the core-api binding.)

---

## 6. RAG design

### The corpus

Two halves, because neither alone is enough:

| Half | Source | Tenant | Roughly |
| ---- | ------ | ------ | ------- |
| Coaching knowledge | `src/main/resources/kb/*.md` | `__global__` (all coaches) | 49 chunks |
| Coach's own data | core-api's Postgres | the owning tenant | ~920 chunks |

The curated half answers "how fast should I add weight" — domain knowledge no
database holds. The core_db half answers "what can Sara actually do" — the
exercise libraries, meal and food libraries, programme and nutrition templates,
and client intake profiles. A coach's effective corpus is their own material plus
the shared knowledge, around **150–200 chunks**.

**Deliberately not ingested:** logged workouts, logged sets, measurements and
activity logs. They are the bulk of core_db by row count, but they are
transactional numbers — near-identical in vector space, they would bury the
libraries in noise while still answering "how much did she lift in July?" worse
than SQL does. analytics-service answers those exactly.

### Retrieval

`SpringAiRagService.retrieve(query, tenantId, topK)` runs `$vectorSearch` and
returns `List<RagChunk>`. Two things make it a real search rather than a fetch:

- **`similarity-threshold` (default 0.62).** Atlas normalises cosine to `[0,1]`
  as `(1 + cos)/2`, so **0.5 means completely unrelated** and the useful range is
  about 0.55–0.80. Set `logging.level.com.coachhub.ai.service.rag=DEBUG` to see
  the scores real questions produce, then tune just below the ones that should
  have matched.
- **`top-k` (default 6)**, out of a corpus far larger than that — which is what
  makes the ranking select anything.

### Tenant isolation

Every chunk carries a `tenantId`, and every search filters on
`tenantId IN (caller, "__global__")`. This is load-bearing: the store holds each
coach's client intake profiles, including injuries and medical conditions. A
blank tenant narrows to global rather than widening — retrieval fails closed.

> ⚠️ **The filter only works if the index declares it.** Filter fields are set
> when the vector index is **created**; adding one to
> `metadata-fields-to-filter` does *not* alter an index that already exists, and
> Spring AI swallows the `IndexAlreadyExists` error. `RagIndexVerifier` checks
> the live index at startup and logs an ERROR naming the fix. See §9.

### Ingest

`KnowledgeIngestService` runs on the scheduler (30s after boot, then every 30m),
not at startup — a cold sync embeds the whole library and would otherwise hold
the pod short of its readiness probe.

It is a **diff, not a re-seed**. Document ids are SHA-256 of
`tenant + source + text`, so:

- unchanged rows keep their id and are **skipped** — no embedding call, no cost
- edited rows get a new id and are **added**
- anything in the store this run did not produce is stale and is **pruned**

That is what makes the knowledge base editable. The previous seeder could only
run once against an empty collection, so editing a document had no effect.

### Fail-soft

Retrieval, ingest and index verification all degrade rather than crash. A bad key,
an unreachable Postgres or a network blip costs the assistant its context for that
request, never the request itself. Postgres is explicitly **not** in the readiness
probe (`management.health.db.enabled: false`) — it is where the corpus is
refreshed from, not where requests are served.

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
| `SPRING_RABBITMQ_HOST`      | `localhost`                      | RabbitMQ host                             |
| `SPRING_RABBITMQ_PORT`      | `5672`                           | RabbitMQ port                             |
| `SPRING_RABBITMQ_USERNAME`  | `coachhub`                       | RabbitMQ user                             |
| `SPRING_RABBITMQ_PASSWORD`  | `secret`                         | RabbitMQ password                         |

### Knowledge base

| Variable                    | Default                          | Purpose                                   |
| --------------------------- | -------------------------------- | ----------------------------------------- |
| `SPRING_DATASOURCE_URL`     | `…localhost:5432/core_db`        | core-api's Postgres — the ingest source   |
| `SPRING_DATASOURCE_USERNAME`| `analytics_user`                 | SELECT-only role (shared with analytics)  |
| `SPRING_DATASOURCE_PASSWORD`| `secret`                         | that role's password                      |
| `RAG_TOP_K`                 | `6`                              | Chunks used to ground each prompt         |
| `RAG_SIMILARITY_THRESHOLD`  | `0.62`                           | Minimum score — **calibrate**, see §6     |
| `RAG_INGEST_ENABLED`        | `true`                           | Refresh loop (set `false` in tests)       |
| `RAG_INGEST_INTERVAL`       | `30m`                            | How often to re-check core_db             |
| `RAG_INGEST_BATCH_SIZE`     | `25`                             | Documents per embedding request           |
| `RAG_REBUILD_INDEX`         | `false`                          | One-shot index repair — see §9            |

> **Why `analytics_user` and not a new role.** It already holds `SELECT` on every
> table plus `ALTER DEFAULT PRIVILEGES` for tables core-api creates later, so this
> service needs **no new grant**. A second role would need provisioning that only
> runs on a first-init of an empty volume — exactly the gap that once left
> analytics-service unable to connect at all.

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

   Note the **two** filter fields. `metadata.tenantId` is what scopes a search to
   one coach; without it every query fails.

### Upgrading an index created before tenant filtering

Atlas will not add filter fields to an existing index, and Spring AI ignores the
`IndexAlreadyExists` error, so a cluster that ran an earlier build keeps an index
that cannot filter by tenant. The symptom is silent: searches fail, retrieval
degrades to "no context" exactly as designed, and the assistant answers with no
knowledge base at all.

`RagIndexVerifier` checks for this at startup and logs an ERROR naming the fix.
To apply it, start once with:

```bash
RAG_REBUILD_INDEX=true
```

It drops and recreates the index with the right fields. The documents survive —
only the index is rebuilt — but searches return nothing until Atlas finishes
reindexing, which is why it is opt-in. Confirm the startup log reads
`tenant isolation active`, then set it back to `false`.

---

## 10. Resilience & failure handling

- **Idempotency** — `process()` looks up `findByRequestId`; if already
  `SUCCEEDED`, it returns early. Redeliveries don't re-call Gemini or re-emit
  events.
- **Generation failure** — any exception is caught → `markFailed(error)` and an
  `ai.completed{status:"failed"}` is published **exactly once**, then the message
  is acked (not rethrown — re-delivery would duplicate events).
- **Listener retry / DLQ** — applies to infra/parse errors *before* `process()`:
  3 retries, then dead-letter to `ai.dlq` (or `ai.plan.dlq`).
- **RAG / seeding** — fail-soft; never crash a request or startup.
- **Plan generation** follows the same rules on its own queue: idempotent by
  `requestId`, `ai.plan.completed{status:"failed"}` published exactly once on any
  exception, message acked rather than rethrown. A prompt the model refused or
  truncated rarely succeeds on a retry, and a redelivery would give core-api two
  completions for one suggestion.
- **Transient Gemini errors are retried in the client** — 503 ("this model is
  currently experiencing high demand"), 429, 408 and any 5xx, with exponential
  backoff (`gemini.retry.*`). A rejected key, a retired model or a malformed
  request is *not* retried: those fail identically every time. This is the only
  place a retry can live — the listener does not requeue, because a redelivery
  would publish a second completion for the same suggestion.
- **Outbound timeouts** — `GeminiHttpConfig` puts a connect and read timeout on
  every Gemini call. Without one the JDK waits forever, and a plan generation
  holds a queue consumer for its whole duration: a single hung connection would
  stop `ai.plan.q` permanently, with nothing in the log to say why.
- **A plan is never silently corrected.** `PlanValidator` reports; it does not
  repair. Dropping an exercise the model invented would produce a shorter plan
  that looks deliberate, and the coach would never learn the model went
  off-script.

---

## 11. Troubleshooting

| Symptom                                              | Likely cause / fix                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Startup fails resolving the embedding model dims     | Invalid/`changeme` `GEMINI_API_KEY`, or no network. Set a real key.                |
| `$vectorSearch` / index errors at startup            | Not on Atlas (community `mongo:7`), or tier blocks programmatic index creation.    |
| **Every** answer is ungrounded, log says index cannot filter | Index predates tenant filtering. Start once with `RAG_REBUILD_INDEX=true` (§9). |
| Answers ungrounded for one tenant only               | That tenant has no data yet and the question missed the curated corpus. Check the ingest log line for its chunk count. |
| Nothing retrieved for questions that clearly match   | Threshold too high. Set `logging.level.com.coachhub.ai.service.rag=DEBUG`, read the real scores, lower `RAG_SIMILARITY_THRESHOLD`. |
| Knowledge base stays empty                           | `RAG_INGEST_ENABLED=false`, or core_db unreachable. The ingest logs a warn per source and retries next interval. |
| KB does not reflect an edited exercise               | Wait one `RAG_INGEST_INTERVAL`. Ids are content hashes, so edits are picked up and the old chunk pruned automatically. |
| `ai.completed` never arrives downstream              | Confirm consumers bind on routing key `ai.completed` (publisher uses messageType). |
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

- 🟡 **Plan quality is unmeasured.** `PlanValidator` proves a plan can be *saved*,
  not that it is *good*. Nothing checks weekly volume, muscle balance or whether
  the progression rule is sane at week 12 — that is the coach's review, by design,
  but it means a structurally perfect plan can still be poor programming.
- 🟡 **Retrieved context is not persisted.** `AiDocument` stores the answer but
  not the chunks that grounded it, so a bad answer cannot be traced back to
  retrieval after the fact. Scores are logged at DEBUG only.
- 🟡 **`coachEmail` not on `ai.requested`** (per contract) yet required on
  `ai.completed` — deferred; depends on the core-api binding.
- ⚪ **No DLQ consumer / alerting** for `ai.dlq` or `ai.plan.dlq`.
- ⚪ **No transient-error retry inside `GeminiClient`** — Gemini failures are
  handled in-service (no broker retry). Add client-side retry if you want
  transient Gemini errors retried.
- ⚪ **Query embeddings are not cached** — an identical prompt is embedded again.
  Only worth doing if the same questions repeat at volume.

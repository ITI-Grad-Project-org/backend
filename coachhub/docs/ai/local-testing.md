# Testing the AI service locally

How to run the RAG pipeline end to end on your machine, and how to tell whether
it is actually working rather than merely running.

---

## ⚠️ Read this first: local and production share one Atlas cluster

`.env`'s `MONGODB_ATLAS_URI` and the `MONGODB_ATLAS_URI` in the AKS
`app-secrets` point at the **same cluster and the same database**
(`cluster0.…mongodb.net/spring-rag-service`).

That matters because the ingest **prunes** anything core_db no longer produces.
A local run against your dev database, using the production collection, would
delete production's chunks — they would all look stale, because your local
database does not contain them.

The guard is the collection name. `docker-compose.override.yml` sets:

```yaml
RAG_COLLECTION: rag_knowledge_dev
RAG_INDEX: vector_index_dev
```

A separate collection gets its own vector index and its own documents, which is
complete isolation for both halves of the problem.

**If you run ai-service outside compose — from your IDE, or with
`mvn spring-boot:run` — you must set those two variables yourself.** Check the
startup log; it names the collection it is using:

```
knowledge base: collection 'rag_knowledge_dev', index 'vector_index_dev'
  filtering on [metadata.tenantId, metadata.source] — tenant isolation active
```

If that line says `rag_knowledge`, stop and fix your environment.

There is a second brake behind this one: a sync that would prune more than
`coachhub.rag.ingest.max-prune-ratio` (default half) of the collection is
refused and logged as an error, on the grounds that wanting to delete most of
the corpus signals a fault rather than a change. It does not fire on collections
under 20 chunks, so it is a backstop, not a substitute for the collection name.

---

## 1. Prerequisites

- The compose stack running: `docker compose up -d`
- A **working** `GEMINI_API_KEY` in `.env` — see §5 if embedding returns 403
- `analytics_user` able to read the local `core_db` (it is the ingest's role too)

## 2. Seed the local database

A fresh dev database is nearly empty, so an ingest produces almost nothing and
you cannot tell a working retriever from a broken one. The fixture seeds **two**
tenants so that tenant isolation is testable rather than assumed:

| Tenant | Distinctive content |
| ------ | ------------------- |
| Iron Forge (`1111…`) | `Zercher Squat`, plus Sara's client profile |
| Coastal Cardio (`2222…`) | `Kettlebell Turkish Get-Up` |

Neither name appears in the curated corpus, so retrieving one proves the core_db
ingest ran — and retrieving the *wrong* one proves isolation failed.

```bash
docker compose exec -T postgres psql -U postgres -d core_db \
  < deploy/docker/rag-dev-seed.sql
```

It is idempotent; re-running it is a no-op.

## 3. Start ai-service

Either rebuild the container so it picks up the override:

```bash
docker compose up -d --build ai-service
```

…or run it from source against the compose infrastructure, which is faster to
iterate on. Note the two isolation variables:

```bash
set -a; . ./.env; set +a
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/core_db \
SPRING_DATASOURCE_USERNAME=analytics_user \
SPRING_DATASOURCE_PASSWORD="$ANALYTICS_DB_PASSWORD" \
SPRING_DATA_MONGODB_URI="$MONGODB_ATLAS_URI" \
SPRING_RABBITMQ_HOST=localhost \
RAG_COLLECTION=rag_knowledge_dev \
RAG_INDEX=vector_index_dev \
RAG_INGEST_INITIAL_DELAY=5s \
LOGGING_LEVEL_COM_COACHHUB_AI=DEBUG \
  mvn -f services/ai-service/pom.xml spring-boot:run
```

> Stop the containerised `ai-service` first if you do this — both would consume
> from the same `ai.q` queue and messages would round-robin between them.

## 4. What a healthy startup looks like

```
knowledge base: collection 'rag_knowledge_dev', index 'vector_index_dev'
  filtering on [metadata.tenantId, metadata.source] — tenant isolation active
read 49 curated chunks from 7 files
read 9 chunks from exercise-library
read 2 chunks from meal-library
read 3 chunks from food-library
read 1 chunks from client-profile
knowledge base synced: 64 chunks (49 curated, 15 from core_db) — 64 added, 0 pruned
```

The number that matters is **added**. On the second run it should be `0 added`
with the same total — that is the content-hash diff working, and it is why the
refresh is cheap enough to run every half hour.

## 5. Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| `403 … Your API key was reported as leaked` | Google revoked the key. Rotate it at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), update `.env` **and** the AKS secret. Never commit it. |
| `0 added` on a first run, no errors | Look for `embedding batch … failed` above — batches fail independently and the sync still reports success. |
| `REFUSING to prune …` | The safety brake. Usually core_db unreachable, or the wrong collection. |
| Index line missing `metadata.tenantId` | Index predates tenant filtering. Restart once with `RAG_REBUILD_INDEX=true`. |
| Nothing retrieved for an obvious question | Threshold too high for your corpus. Watch the DEBUG scores and lower `RAG_SIMILARITY_THRESHOLD`. |

## 6. Driving it end to end

The gateway is a WebSocket, authenticated from the access token. Connect with
socket.io, passing the token in `auth`:

```js
const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  auth: { token: '<a real access token>' },
});

socket.on('ai.accepted',     (m) => console.log('accepted', m.requestId));
socket.on('ai.completed',    (m) => console.log(m.status, m.summary));
socket.on('ai.rejected',     (m) => console.log('bad request:', m.message));
socket.on('ai.unauthorized', () => console.log('token rejected'));

socket.emit('ai.requested', {
  kind: 'advice',
  prompt: 'What should I watch out for when programming for Sara?',
});
```

The tenant comes from the token, never from the message. A socket with no token,
a forged token or an expired one is closed — and the token is re-checked on
every message, so an expired session cannot ride a long-lived connection.

### Proving tenant isolation

Ask the same question with two tokens carrying different `tenantId`s:

- Iron Forge's token asking about the *Turkish Get-Up* must **not** retrieve it
- Coastal Cardio's token asking about *Sara* must **not** retrieve her profile

Watch the DEBUG line from `SpringAiRagService` — it prints each retrieved
chunk's source and score, which is also how you calibrate the threshold.

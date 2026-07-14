# CoachHub — Kubernetes Deployment

> Deliverable 3 of 4. Assumes images are already built/pushed per
> [Docker deployment](02-docker-deployment.md). Replace the registry placeholder with your
> own + an **immutable tag** (git SHA or semver) — never `:latest`.

> **Implemented (2026-07-10) — the canonical manifests now live in `deploy/k8s/`**
> (numbered folders exactly as laid out below) and are the source of truth over the
> snippets in this doc. Azure deltas vs. the examples here: StorageClass is
> **`managed-csi`** (AKS), images come from **ACR** (`coachhub.azurecr.io` placeholder),
> ports are **8082 = analytics / 8083 = notification**, and probe/env details follow the
> real code (see `deploy/k8s/README.md` and the
> [Azure runbook](05-azure-deployment.md)).

**Assumptions:** ingress-nginx and cert-manager (with a `letsencrypt-prod` ClusterIssuer) are
installed; metrics-server is installed (HPA needs it); public host is
`api.coachhub.example.com`.

## 0. The one rule Compose users trip over

**`depends_on` does not exist in Kubernetes.** Pods start in no particular order and infra may
restart at any time. Therefore every app **must retry its Postgres/RabbitMQ connections with
backoff at startup** (Spring AMQP + Hibernate retry by default if the pod is allowed to crash
and restart; for NestJS configure TypeORM `retryAttempts`/`retryDelay` and a RabbitMQ reconnect
policy). Ordering is handled by: crash-loop + restart (normal, not an error), `startupProbe`
with a generous window, and the migration Job gating `core-api` rollout in CI.

## 1. Folder layout

```
deploy/k8s/
├── 00-namespace.yaml
├── 10-config/
│   ├── app-config.yaml            # non-secret env (ConfigMap)
│   ├── app-secrets.yaml           # placeholder Secret — use Sealed/External Secrets in real prod
│   └── postgres-init-script.yaml  # create-databases.sh as a ConfigMap
├── 20-data/
│   ├── postgres.yaml              # StatefulSet + headless Svc + client Svc
│   ├── rabbitmq.yaml              # StatefulSet + PVC + Svc
│   └── redis.yaml                 # Deployment + Svc (disposable cache — locked decision)
├── 30-migrations/
│   └── core-api-migrations-job.yaml
├── 40-apps/
│   ├── core-api.yaml
│   ├── ai-service.yaml
│   ├── notification-service.yaml
│   └── analytics-service.yaml
├── 50-ingress/
│   └── ingress.yaml               # core-api ONLY (locked decision)
└── 60-autoscaling/
    └── hpa.yaml
```

Apply order = numeric prefix order (see §10 and Deliverable 4 for the full rollout runbook).

## 2. Namespace — `00-namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: coachhub
  labels:
    app.kubernetes.io/part-of: coachhub
```

## 3. Config & secrets — `10-config/`

### `app-config.yaml` — non-secret configuration

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: coachhub
data:
  RABBITMQ_HOST: "rabbitmq"
  RABBITMQ_PORT: "5672"
  POSTGRES_HOST: "postgres"
  POSTGRES_PORT: "5432"
  REDIS_URL: "redis://redis:6379"
  CORE_DB_NAME: "core_db"
  ANALYTICS_DB_NAME: "analytics_db"
  FRONTEND_URL: "https://app.coachhub.example.com"
  MAIL_PROVIDER: "resend"
  MAIL_FROM: "no-reply@coachhub.example.com"
  SPRING_PROFILES_ACTIVE: "kubernetes"
```

### `app-secrets.yaml` — placeholder Secret

> ⚠️ **Real production:** never commit Secret manifests with values. Use **Sealed Secrets**
> (encrypted, git-safe) or **External Secrets Operator** (syncs from AWS Secrets
> Manager/Vault/GCP SM). This plain Secret exists so the stack is `kubectl apply`-able
> end-to-end; replace values before any shared environment.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: coachhub
type: Opaque
stringData:
  POSTGRES_SUPERUSER: "postgres"
  POSTGRES_SUPERUSER_PASSWORD: "CHANGE_ME_superuser"
  CORE_DB_USER: "core_user"
  CORE_DB_PASSWORD: "CHANGE_ME_core"
  ANALYTICS_DB_USER: "analytics_user"
  ANALYTICS_DB_PASSWORD: "CHANGE_ME_analytics"
  RABBITMQ_USER: "coachhub"
  RABBITMQ_PASSWORD: "CHANGE_ME_rabbit"
  JWT_ACCESS_SECRET: "CHANGE_ME_32_bytes_minimum_entropy"
  JWT_REFRESH_SECRET: "CHANGE_ME_32_bytes_minimum_entropy"
  MONGODB_ATLAS_URI: "mongodb+srv://USER:PASS@cluster.mongodb.net/coachhub-rag?retryWrites=true"
  GEMINI_API_KEY: "CHANGE_ME"
  RESEND_API_KEY: "CHANGE_ME"
```

### `postgres-init-script.yaml` — init script as ConfigMap

Same script as Docker (TypeORM/Hibernate **cannot** create databases or roles — this must run
before any app connects; it executes once on first init of the PVC).

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-init-script
  namespace: coachhub
data:
  10-create-databases.sh: |
    #!/bin/sh
    set -eu
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        CREATE USER core_user      WITH PASSWORD '${CORE_DB_PASSWORD}';
        CREATE USER analytics_user WITH PASSWORD '${ANALYTICS_DB_PASSWORD}';
        CREATE DATABASE core_db      OWNER core_user;
        CREATE DATABASE analytics_db OWNER analytics_user;
        REVOKE CONNECT ON DATABASE core_db      FROM PUBLIC;
        REVOKE CONNECT ON DATABASE analytics_db FROM PUBLIC;
        GRANT  CONNECT ON DATABASE core_db      TO core_user;
        GRANT  CONNECT ON DATABASE analytics_db TO analytics_user;
    EOSQL
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname core_db \
      -c 'ALTER SCHEMA public OWNER TO core_user;'
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname analytics_db \
      -c 'ALTER SCHEMA public OWNER TO analytics_user;'
```

## 4. Data layer — `20-data/`

### `postgres.yaml` — StatefulSet + PVC + headless Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres-hl            # headless: stable per-pod DNS for the StatefulSet
  namespace: coachhub
spec:
  clusterIP: None
  selector:
    app: postgres
  ports:
    - name: pg
      port: 5432
---
apiVersion: v1
kind: Service
metadata:
  name: postgres               # client-facing name used in connection strings
  namespace: coachhub
spec:
  selector:
    app: postgres
  ports:
    - name: pg
      port: 5432
      targetPort: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: coachhub
spec:
  serviceName: postgres-hl
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      securityContext:
        fsGroup: 999                       # postgres gid in the official image
      containers:
        - name: postgres
          image: postgres:16.4-alpine
          ports:
            - containerPort: 5432
              name: pg
          env:
            - name: POSTGRES_USER
              valueFrom: { secretKeyRef: { name: app-secrets, key: POSTGRES_SUPERUSER } }
            - name: POSTGRES_PASSWORD
              valueFrom: { secretKeyRef: { name: app-secrets, key: POSTGRES_SUPERUSER_PASSWORD } }
            - name: POSTGRES_DB
              value: postgres
            - name: CORE_DB_PASSWORD
              valueFrom: { secretKeyRef: { name: app-secrets, key: CORE_DB_PASSWORD } }
            - name: ANALYTICS_DB_PASSWORD
              valueFrom: { secretKeyRef: { name: app-secrets, key: ANALYTICS_DB_PASSWORD } }
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata   # subdir: PVC root is lost+found-unsafe
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
            - name: init-script
              mountPath: /docker-entrypoint-initdb.d
              readOnly: true
          readinessProbe:
            exec:
              command: ["sh", "-c", "pg_isready -U $POSTGRES_USER -d core_db"]
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 6
          livenessProbe:
            exec:
              command: ["sh", "-c", "pg_isready -U $POSTGRES_USER"]
            initialDelaySeconds: 30
            periodSeconds: 10
          resources:
            requests: { cpu: 250m, memory: 512Mi }
            limits:   { cpu: "1",  memory: 1Gi }
      volumes:
        - name: init-script
          configMap:
            name: postgres-init-script
            defaultMode: 0555
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: standard
        resources:
          requests:
            storage: 10Gi
```

> **Real production:** prefer managed Postgres (RDS/Cloud SQL) — backups, PITR, failover for
> free. The two-logical-DB design makes that a connection-string-only move.

### `rabbitmq.yaml` — StatefulSet + PVC + Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: rabbitmq-hl
  namespace: coachhub
spec:
  clusterIP: None
  selector:
    app: rabbitmq
  ports:
    - name: amqp
      port: 5672
---
apiVersion: v1
kind: Service
metadata:
  name: rabbitmq
  namespace: coachhub
spec:
  selector:
    app: rabbitmq
  ports:
    - name: amqp
      port: 5672
      targetPort: 5672
    - name: management        # UI stays cluster-internal; reach it via kubectl port-forward
      port: 15672
      targetPort: 15672
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: rabbitmq
  namespace: coachhub
spec:
  serviceName: rabbitmq-hl
  replicas: 1
  selector:
    matchLabels:
      app: rabbitmq
  template:
    metadata:
      labels:
        app: rabbitmq
    spec:
      containers:
        - name: rabbitmq
          image: rabbitmq:3.13-management-alpine
          ports:
            - { containerPort: 5672,  name: amqp }
            - { containerPort: 15672, name: management }
          env:
            - name: RABBITMQ_DEFAULT_USER
              valueFrom: { secretKeyRef: { name: app-secrets, key: RABBITMQ_USER } }
            - name: RABBITMQ_DEFAULT_PASS
              valueFrom: { secretKeyRef: { name: app-secrets, key: RABBITMQ_PASSWORD } }
          volumeMounts:
            - name: data
              mountPath: /var/lib/rabbitmq
          readinessProbe:
            exec:
              command: ["rabbitmq-diagnostics", "-q", "check_running"]
            initialDelaySeconds: 20
            periodSeconds: 10
            timeoutSeconds: 10
          livenessProbe:
            exec:
              command: ["rabbitmq-diagnostics", "-q", "ping"]
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 10
          resources:
            requests: { cpu: 250m, memory: 512Mi }
            limits:   { cpu: "1",  memory: 1Gi }
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: standard
        resources:
          requests:
            storage: 5Gi
```

> **Real production:** RabbitMQ **Cluster Operator** with a 3-node cluster and **quorum queues**
> instead of this single-node StatefulSet.

### `redis.yaml` — Deployment + Service (locked: disposable cache, no StatefulSet)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: coachhub
spec:
  selector:
    app: redis
  ports:
    - name: redis
      port: 6379
      targetPort: 6379
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: coachhub
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7.4-alpine
          args: ["redis-server", "--maxmemory", "256mb", "--maxmemory-policy", "allkeys-lru"]
          ports:
            - containerPort: 6379
          readinessProbe:
            exec: { command: ["redis-cli", "ping"] }
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            exec: { command: ["redis-cli", "ping"] }
            initialDelaySeconds: 15
            periodSeconds: 10
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits:   { cpu: 500m, memory: 384Mi }
      # No volume on purpose: cache contents must be reconstructible.
```

## 5. TypeORM migration Job — `30-migrations/core-api-migrations-job.yaml`

Locked requirement: **`synchronize: false` in production**; schema changes only via
`typeorm migration:run`, executed **before** the new core-api version rolls out. A Job (not an
init container) is chosen so N replicas don't race to migrate and rollout order is explicit in
CI: `apply job → kubectl wait → apply deployment`.

Jobs are immutable — CI must delete the previous one and substitute the new image tag
(`sed`/kustomize) each release.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: core-api-migrations       # CI: kubectl delete job core-api-migrations --ignore-not-found first
  namespace: coachhub
  labels:
    app: core-api-migrations
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 300
  ttlSecondsAfterFinished: 86400
  template:
    metadata:
      labels:
        app: core-api-migrations
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: ghcr.io/coachhub/core-api:1.0.0    # ALWAYS the same tag as the core-api Deployment
          command:
            - node
            - node_modules/typeorm/cli.js
            - migration:run
            - -d
            - dist/data-source.js
          env:
            - name: NODE_ENV
              value: production
            - name: DATABASE_URL
              value: postgresql://$(CORE_DB_USER):$(CORE_DB_PASSWORD)@postgres:5432/core_db
            - name: CORE_DB_USER
              valueFrom: { secretKeyRef: { name: app-secrets, key: CORE_DB_USER } }
            - name: CORE_DB_PASSWORD
              valueFrom: { secretKeyRef: { name: app-secrets, key: CORE_DB_PASSWORD } }
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits:   { cpu: 500m, memory: 512Mi }
```

CI gate:

```bash
kubectl -n coachhub delete job core-api-migrations --ignore-not-found
kubectl -n coachhub apply -f deploy/k8s/30-migrations/core-api-migrations-job.yaml
kubectl -n coachhub wait --for=condition=complete job/core-api-migrations --timeout=300s
# only then:
kubectl -n coachhub apply -f deploy/k8s/40-apps/core-api.yaml
```

**Assumption:** `dist/data-source.js` exports the TypeORM `DataSource`. The repo's
`package.json` currently has no `migration:run` script — add
`"migration:run": "typeorm migration:run -d dist/data-source.js"` or use the CLI form above.

## 6. Applications — `40-apps/`

Common to all four: immutable image tags, non-root `securityContext`, requests/limits,
liveness + readiness (+ startup where boot is slow), config from `app-config` / `app-secrets`.

### `core-api.yaml`

`/health` must be implemented with **@nestjs/terminus** checking Postgres (TypeORM ping) and
RabbitMQ connectivity — that is exactly what readiness gates on.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: core-api
  namespace: coachhub
  labels:
    app: core-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: core-api
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: core-api
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000              # 'node' user in node:22-alpine
      containers:
        - name: core-api
          image: ghcr.io/coachhub/core-api:1.0.0
          ports:
            - containerPort: 3000
              name: http
          env:
            - name: NODE_ENV
              value: production
            - name: PORT
              value: "3000"
            - name: CORE_DB_USER
              valueFrom: { secretKeyRef: { name: app-secrets, key: CORE_DB_USER } }
            - name: CORE_DB_PASSWORD
              valueFrom: { secretKeyRef: { name: app-secrets, key: CORE_DB_PASSWORD } }
            - name: DATABASE_URL
              value: postgresql://$(CORE_DB_USER):$(CORE_DB_PASSWORD)@postgres:5432/core_db
            - name: REDIS_URL
              valueFrom: { configMapKeyRef: { name: app-config, key: REDIS_URL } }
            - name: RABBITMQ_USER
              valueFrom: { secretKeyRef: { name: app-secrets, key: RABBITMQ_USER } }
            - name: RABBITMQ_PASSWORD
              valueFrom: { secretKeyRef: { name: app-secrets, key: RABBITMQ_PASSWORD } }
            - name: RABBITMQ_URL
              value: amqp://$(RABBITMQ_USER):$(RABBITMQ_PASSWORD)@rabbitmq:5672
            - name: JWT_ACCESS_SECRET
              valueFrom: { secretKeyRef: { name: app-secrets, key: JWT_ACCESS_SECRET } }
            - name: JWT_REFRESH_SECRET
              valueFrom: { secretKeyRef: { name: app-secrets, key: JWT_REFRESH_SECRET } }
            - name: FRONTEND_URL
              valueFrom: { configMapKeyRef: { name: app-config, key: FRONTEND_URL } }
          startupProbe:                    # tolerate slow first boot incl. MQ retry loop
            httpGet: { path: /health, port: http }
            periodSeconds: 5
            failureThreshold: 24           # up to 2 min
          readinessProbe:
            httpGet: { path: /health, port: http }
            periodSeconds: 10
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /health, port: http }
            periodSeconds: 15
            failureThreshold: 3
          resources:
            requests: { cpu: 200m, memory: 256Mi }
            limits:   { cpu: "1",  memory: 512Mi }
---
apiVersion: v1
kind: Service
metadata:
  name: core-api
  namespace: coachhub
spec:
  type: ClusterIP
  selector:
    app: core-api
  ports:
    - name: http
      port: 80
      targetPort: http
```

### `ai-service.yaml` (ClusterIP-only — never exposed)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-service
  namespace: coachhub
  labels:
    app: ai-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ai-service
  template:
    metadata:
      labels:
        app: ai-service
    spec:
      securityContext:
        runAsNonRoot: true
      containers:
        - name: ai-service
          image: ghcr.io/coachhub/ai-service:1.0.0
          ports:
            - containerPort: 8081
              name: http
          env:
            - name: SERVER_PORT
              value: "8081"
            - name: SPRING_PROFILES_ACTIVE
              valueFrom: { configMapKeyRef: { name: app-config, key: SPRING_PROFILES_ACTIVE } }
            - name: SPRING_DATA_MONGODB_URI          # managed Atlas — URI only, never in-cluster
              valueFrom: { secretKeyRef: { name: app-secrets, key: MONGODB_ATLAS_URI } }
            - name: SPRING_RABBITMQ_HOST
              valueFrom: { configMapKeyRef: { name: app-config, key: RABBITMQ_HOST } }
            - name: SPRING_RABBITMQ_USERNAME
              valueFrom: { secretKeyRef: { name: app-secrets, key: RABBITMQ_USER } }
            - name: SPRING_RABBITMQ_PASSWORD
              valueFrom: { secretKeyRef: { name: app-secrets, key: RABBITMQ_PASSWORD } }
            - name: GEMINI_API_KEY
              valueFrom: { secretKeyRef: { name: app-secrets, key: GEMINI_API_KEY } }
          startupProbe:
            httpGet: { path: /actuator/health/liveness, port: http }
            periodSeconds: 5
            failureThreshold: 36           # JVM + Atlas handshake: up to 3 min
          readinessProbe:
            httpGet: { path: /actuator/health/readiness, port: http }
            periodSeconds: 10
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /actuator/health/liveness, port: http }
            periodSeconds: 15
            failureThreshold: 3
          resources:
            requests: { cpu: 250m, memory: 512Mi }
            limits:   { cpu: "1",  memory: 1Gi }
---
apiVersion: v1
kind: Service
metadata:
  name: ai-service
  namespace: coachhub
spec:
  type: ClusterIP
  selector:
    app: ai-service
  ports:
    - name: http
      port: 8081
      targetPort: http
```

### `notification-service.yaml` (stateless, ClusterIP-only)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-service
  namespace: coachhub
  labels:
    app: notification-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: notification-service
  template:
    metadata:
      labels:
        app: notification-service
    spec:
      securityContext:
        runAsNonRoot: true
      containers:
        - name: notification-service
          image: ghcr.io/coachhub/notification-service:1.0.0
          ports:
            - containerPort: 8082
              name: http
          env:
            - name: SERVER_PORT
              value: "8082"
            - name: SPRING_PROFILES_ACTIVE
              valueFrom: { configMapKeyRef: { name: app-config, key: SPRING_PROFILES_ACTIVE } }
            - name: SPRING_RABBITMQ_HOST
              valueFrom: { configMapKeyRef: { name: app-config, key: RABBITMQ_HOST } }
            - name: SPRING_RABBITMQ_USERNAME
              valueFrom: { secretKeyRef: { name: app-secrets, key: RABBITMQ_USER } }
            - name: SPRING_RABBITMQ_PASSWORD
              valueFrom: { secretKeyRef: { name: app-secrets, key: RABBITMQ_PASSWORD } }
            - name: MAIL_PROVIDER                    # resend in prod, mailhog only in dev clusters
              valueFrom: { configMapKeyRef: { name: app-config, key: MAIL_PROVIDER } }
            - name: MAIL_FROM
              valueFrom: { configMapKeyRef: { name: app-config, key: MAIL_FROM } }
            - name: RESEND_API_KEY
              valueFrom: { secretKeyRef: { name: app-secrets, key: RESEND_API_KEY } }
          startupProbe:
            httpGet: { path: /actuator/health/liveness, port: http }
            periodSeconds: 5
            failureThreshold: 24
          readinessProbe:
            httpGet: { path: /actuator/health/readiness, port: http }
            periodSeconds: 10
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /actuator/health/liveness, port: http }
            periodSeconds: 15
            failureThreshold: 3
          resources:
            requests: { cpu: 150m, memory: 384Mi }
            limits:   { cpu: 500m, memory: 768Mi }
---
apiVersion: v1
kind: Service
metadata:
  name: notification-service
  namespace: coachhub
spec:
  type: ClusterIP
  selector:
    app: notification-service
  ports:
    - name: http
      port: 8082
      targetPort: http
```

### `analytics-service.yaml` (ClusterIP-only)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-service
  namespace: coachhub
  labels:
    app: analytics-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: analytics-service
  template:
    metadata:
      labels:
        app: analytics-service
    spec:
      securityContext:
        runAsNonRoot: true
      containers:
        - name: analytics-service
          image: ghcr.io/coachhub/analytics-service:1.0.0
          ports:
            - containerPort: 8083
              name: http
          env:
            - name: SERVER_PORT
              value: "8083"
            - name: SPRING_PROFILES_ACTIVE
              valueFrom: { configMapKeyRef: { name: app-config, key: SPRING_PROFILES_ACTIVE } }
            - name: SPRING_DATASOURCE_URL            # analytics_db ONLY — never core_db
              value: jdbc:postgresql://postgres:5432/analytics_db
            - name: SPRING_DATASOURCE_USERNAME
              valueFrom: { secretKeyRef: { name: app-secrets, key: ANALYTICS_DB_USER } }
            - name: SPRING_DATASOURCE_PASSWORD
              valueFrom: { secretKeyRef: { name: app-secrets, key: ANALYTICS_DB_PASSWORD } }
            - name: SPRING_RABBITMQ_HOST
              valueFrom: { configMapKeyRef: { name: app-config, key: RABBITMQ_HOST } }
            - name: SPRING_RABBITMQ_USERNAME
              valueFrom: { secretKeyRef: { name: app-secrets, key: RABBITMQ_USER } }
            - name: SPRING_RABBITMQ_PASSWORD
              valueFrom: { secretKeyRef: { name: app-secrets, key: RABBITMQ_PASSWORD } }
          startupProbe:
            httpGet: { path: /actuator/health/liveness, port: http }
            periodSeconds: 5
            failureThreshold: 24
          readinessProbe:
            httpGet: { path: /actuator/health/readiness, port: http }
            periodSeconds: 10
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /actuator/health/liveness, port: http }
            periodSeconds: 15
            failureThreshold: 3
          resources:
            requests: { cpu: 200m, memory: 384Mi }
            limits:   { cpu: 750m, memory: 768Mi }
---
apiVersion: v1
kind: Service
metadata:
  name: analytics-service
  namespace: coachhub
spec:
  type: ClusterIP
  selector:
    app: analytics-service
  ports:
    - name: http
      port: 8083
      targetPort: http
```

## 7. Ingress — `50-ingress/ingress.yaml` (core-api ONLY)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: core-api
  namespace: coachhub
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: 10m
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.coachhub.example.com
      secretName: coachhub-api-tls        # created/renewed by cert-manager
  rules:
    - host: api.coachhub.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: core-api
                port:
                  name: http
```

No Ingress objects exist for the Spring services — locked decision #4. They are reachable only
as `ai-service:8081`, `notification-service:8082`, `analytics-service:8083` inside the cluster
(and shouldn't even be that, once NetworkPolicies land — see §11).

## 8. HPAs — `60-autoscaling/hpa.yaml`

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: core-api
  namespace: coachhub
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: core-api
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ai-service
  namespace: coachhub
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ai-service
  minReplicas: 1
  maxReplicas: 4
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: analytics-service
  namespace: coachhub
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: analytics-service
  minReplicas: 1
  maxReplicas: 3
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 75
```

> ⚠️ **CPU is the wrong signal for MQ consumers** — an idle-CPU service with 50k queued messages
> won't scale. **Real production: KEDA** with a `rabbitmq` scaler on queue depth (e.g. scale
> ai-service on `ai-service.queue` length). CPU HPA ships here because it needs only
> metrics-server; treat it as a stopgap.

## 9. Spring probe config — `application-kubernetes.yml`

Add to each Spring service's `src/main/resources/` (activated by
`SPRING_PROFILES_ACTIVE=kubernetes` from the ConfigMap):

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
  endpoint:
    health:
      probes:
        enabled: true            # exposes /actuator/health/liveness + /readiness
      show-details: never
  health:
    livenessstate:
      enabled: true
    readinessstate:
      enabled: true
    rabbit:
      enabled: true              # broker down → NOT READY → removed from consumers
    # ai-service: mongo health auto-registers via spring-boot-starter-data-mongodb
    # analytics-service: db (JPA/DataSource) health auto-registers

spring:
  rabbitmq:
    listener:
      simple:
        retry:
          enabled: true          # startup/consume retries — replaces Compose depends_on
          initial-interval: 2s
          multiplier: 2
          max-attempts: 5        # then reject → DLX → per-service DLQ
    template:
      retry:
        enabled: true
        initial-interval: 1s
        multiplier: 2
        max-attempts: 5

server:
  shutdown: graceful             # drain in-flight messages/requests on SIGTERM
```

**core-api equivalent:** implement `/health` with `@nestjs/terminus` —
`TypeOrmHealthIndicator` (DB ping) + a RabbitMQ connectivity check (e.g. microservice ping or
`amqp-connection-manager` `isConnected()`), and configure TypeORM `retryAttempts: 10`,
`retryDelay: 3000` so the pod survives Postgres arriving late.

## 10. First-apply order (one-time bootstrap)

```bash
kubectl apply -f deploy/k8s/00-namespace.yaml
kubectl apply -f deploy/k8s/10-config/
kubectl apply -f deploy/k8s/20-data/
kubectl -n coachhub rollout status statefulset/postgres statefulset/rabbitmq deployment/redis
kubectl apply -f deploy/k8s/30-migrations/
kubectl -n coachhub wait --for=condition=complete job/core-api-migrations --timeout=300s
kubectl apply -f deploy/k8s/40-apps/
kubectl apply -f deploy/k8s/50-ingress/
kubectl apply -f deploy/k8s/60-autoscaling/
```

(Deliverable 4 expands this into the full first-deploy runbook.)

## 11. Production hardening checklist

| Area | Ship now (this doc) | Upgrade for real production |
|---|---|---|
| Secrets | Plain `Secret` manifest | **Sealed Secrets / External Secrets Operator**; rotate the leaked Atlas URI |
| Postgres | Single-node StatefulSet + PVC | **Managed (RDS/Cloud SQL)** with PITR; or CloudNativePG operator; automated backups either way |
| RabbitMQ | Single-node StatefulSet, classic queues | **RabbitMQ Cluster Operator, 3 nodes, quorum queues** |
| Consumer scaling | CPU HPAs | **KEDA queue-depth scalers** per consumer queue |
| Network | Flat namespace networking | **NetworkPolicies**: default-deny; ingress-nginx→core-api only; apps→rabbitmq/postgres/redis by label; egress allow-list for Atlas/Gemini/Resend |
| Availability | maxUnavailable: 0 rolling updates | **PodDisruptionBudgets** for core-api + data layer; topologySpreadConstraints across zones |
| Containers | Non-root | `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, drop ALL capabilities, image scanning (Trivy) + signing (cosign) in CI |
| Observability | Actuator/Terminus health | Prometheus + Grafana (scrape `/actuator/prometheus`), OTel traces with `eventId` propagated as trace baggage, alert on **DLQ depth > 0** |
| Delivery | `kubectl apply` from CI | Kustomize overlays (dev/staging/prod) or Helm; Argo CD/Flux for GitOps; migration Job as pre-sync hook |
| DNS/TLS | cert-manager HTTP-01 | DNS-01 for wildcard; HSTS; WAF/rate limiting at the edge |

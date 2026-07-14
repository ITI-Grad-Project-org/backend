# CoachHub — Kubernetes manifests (AKS-ready)

Numbered folders = apply order. Azure specifics: `storageClassName: managed-csi`
(AKS Azure Disk CSI), images pulled from ACR (`coachhub.azurecr.io` — replace with
your registry's login server everywhere, ideally via `sed`/kustomize in CI).

Full Azure runbook: [docs/deployment/05-azure-deployment.md](../../docs/deployment/05-azure-deployment.md).
Architecture & rationale: [docs/deployment/](../../docs/deployment/).

## Secrets — never commit real values

`secrets/app-secrets.example.yaml` is a **template** (placeholders only) and sits
outside the numbered folders so a directory apply can never clobber the real
Secret. Create the real one from your gitignored `.env`:

```bash
cp .env.example .env          # fill in real values (repo root; never committed)
./create-secrets.sh           # builds/updates Secret coachhub/app-secrets from .env
```

(Alternative: `cp secrets/app-secrets.example.yaml secrets/app-secrets.local.yaml`,
fill it, `kubectl apply -f secrets/app-secrets.local.yaml` — `*.local.yaml` is
gitignored. Real prod: External Secrets Operator + Azure Key Vault.)

## First deploy

```bash
kubectl apply -f 00-namespace.yaml
./create-secrets.sh                              # real Secret from your local .env
kubectl apply -f 10-config/                      # ConfigMap + Postgres init script
kubectl apply -f 20-data/
kubectl -n coachhub rollout status statefulset/postgres statefulset/rabbitmq deployment/redis

# Verify the init script created the app databases:
kubectl -n coachhub exec postgres-0 -- psql -U postgres -c '\l'   # core_db + analytics_db

kubectl apply -f 30-migrations/
kubectl -n coachhub wait --for=condition=complete job/core-api-migrations --timeout=300s

kubectl apply -f 40-apps/                        # consumers + producer
kubectl apply -f 50-ingress/                     # needs ingress-nginx + cert-manager
kubectl apply -f 60-autoscaling/
```

## Every release (CI)

```bash
TAG=<git-sha>
kubectl -n coachhub delete job core-api-migrations --ignore-not-found
# point Job + Deployments at the new tag (sed shown; kustomize images is the cleaner upgrade)
grep -rl 'coachhub.azurecr.io' 30-migrations 40-apps | xargs sed -i "s|\(coachhub.azurecr.io/[a-z-]*\):[^ ]*|\1:${TAG}|"
kubectl apply -f 30-migrations/
kubectl -n coachhub wait --for=condition=complete job/core-api-migrations --timeout=300s
kubectl apply -f 40-apps/
kubectl -n coachhub rollout status deployment/core-api
```

## Notes

- **No `depends_on` in K8s** — apps retry connections (TypeORM `retryAttempts`,
  Spring AMQP reconnect) and the generous `startupProbe` windows cover infra
  arriving late. Crash-loop during bootstrap is normal, not an error.
- Changed a secret value? Re-run `./create-secrets.sh`, then
  `kubectl -n coachhub rollout restart deployment` (pods read secrets at startup).
- Production upgrades (in order of value): KEDA queue-depth scaling for the MQ
  consumers, Azure Database for PostgreSQL (connection-string-only move),
  RabbitMQ Cluster Operator + quorum queues, NetworkPolicies, PDBs.

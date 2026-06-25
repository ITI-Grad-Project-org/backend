# Infrastructure (Kubernetes)

For local/CI use, the `docker-compose.yml` at the repo root spins up Postgres, MongoDB, and RabbitMQ directly.

For Kubernetes deployments, use the community Helm charts:

| Component | Helm chart |
|---|---|
| PostgreSQL | `bitnami/postgresql` |
| MongoDB | `bitnami/mongodb` |
| RabbitMQ | `bitnami/rabbitmq` |

Example (adjust values per environment):

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami

helm install coachhub-postgres bitnami/postgresql \
  --namespace coachhub \
  --set auth.username=coachhub \
  --set auth.password=<secret> \
  --set auth.database=coachhub

helm install coachhub-mongodb bitnami/mongodb \
  --namespace coachhub \
  --set auth.username=coachhub \
  --set auth.password=<secret>

helm install coachhub-rabbitmq bitnami/rabbitmq \
  --namespace coachhub \
  --set auth.username=coachhub \
  --set auth.password=<secret>
```

TODO: add a `values/` directory with per-environment Helm value overrides.

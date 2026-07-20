#!/usr/bin/env bash
# Build/refresh the coachhub `app-secrets` Secret from your local .env file,
# so real secret values NEVER exist in the repo or its git history.
#
#   cp .env.example .env      # fill in real values (.env is gitignored)
#   ./deploy/k8s/create-secrets.sh              # uses <repo>/.env
#   ./deploy/k8s/create-secrets.sh path/to.env  # or an explicit file
#
# Idempotent — re-running updates the Secret in place. Pods read secrets at
# startup, so after changing values:
#   kubectl -n coachhub rollout restart deployment
set -euo pipefail

ENV_FILE="${1:-$(cd "$(dirname "$0")/../.." && pwd)/.env}"
NAMESPACE="${NAMESPACE:-coachhub}"

[[ -f "$ENV_FILE" ]] || {
  echo "ERROR: env file not found: $ENV_FILE  (cp .env.example .env and fill it in first)" >&2
  exit 1
}

# Read KEY=VALUE without shell-sourcing the file, so values containing
# & ? # spaces etc. (Atlas URIs!) stay literal. Last occurrence wins;
# surrounding quotes are stripped like docker compose does.
getval() {
  local raw
  raw="$(grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  raw="${raw%\"}"; raw="${raw#\"}"
  raw="${raw%\'}"; raw="${raw#\'}"
  printf '%s' "$raw"
}

missing=0
for key in POSTGRES_SUPERUSER_PASSWORD CORE_DB_PASSWORD ANALYTICS_DB_PASSWORD \
           RABBITMQ_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET \
           GEMINI_API_KEY MONGODB_ATLAS_URI; do
  val="$(getval "$key")"
  if [[ -z "$val" || "$val" == change-me* || "$val" == CHANGE_ME* ]]; then
    echo "ERROR: $key is empty or still a placeholder in $ENV_FILE" >&2
    missing=1
  fi
done
[[ "$missing" == 0 ]] || exit 1

# Optional values fall back to safe placeholders (core-api requires the vars
# to exist; the features simply stay unconfigured until you set real ones).
POSTGRES_SUPERUSER="$(getval POSTGRES_SUPERUSER)"
RABBITMQ_USER="$(getval RABBITMQ_USER)"

kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || kubectl create namespace "$NAMESPACE"

kubectl -n "$NAMESPACE" create secret generic app-secrets \
  --from-literal=POSTGRES_SUPERUSER="${POSTGRES_SUPERUSER:-postgres}" \
  --from-literal=POSTGRES_SUPERUSER_PASSWORD="$(getval POSTGRES_SUPERUSER_PASSWORD)" \
  --from-literal=CORE_DB_USER="core_user" \
  --from-literal=CORE_DB_PASSWORD="$(getval CORE_DB_PASSWORD)" \
  --from-literal=ANALYTICS_DB_USER="analytics_user" \
  --from-literal=ANALYTICS_DB_PASSWORD="$(getval ANALYTICS_DB_PASSWORD)" \
  --from-literal=RABBITMQ_USER="${RABBITMQ_USER:-coachhub}" \
  --from-literal=RABBITMQ_PASSWORD="$(getval RABBITMQ_PASSWORD)" \
  --from-literal=JWT_ACCESS_SECRET="$(getval JWT_ACCESS_SECRET)" \
  --from-literal=JWT_REFRESH_SECRET="$(getval JWT_REFRESH_SECRET)" \
  --from-literal=GEMINI_API_KEY="$(getval GEMINI_API_KEY)" \
  --from-literal=MONGODB_ATLAS_URI="$(getval MONGODB_ATLAS_URI)" \
  --from-literal=MAIL_PASSWORD="$(getval MAIL_PASSWORD)" \
  --from-literal=GOOGLE_OAUTH_CLIENT_ID="$(getval GOOGLE_OAUTH_CLIENT_ID)" \
  --from-literal=AWS_ACCESS_KEY_ID="$(getval AWS_ACCESS_KEY_ID)" \
  --from-literal=AWS_SECRET_ACCESS_KEY="$(getval AWS_SECRET_ACCESS_KEY)" \
  --from-literal=AWS_S3_BUCKET="$(getval AWS_S3_BUCKET)" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✔ Secret ${NAMESPACE}/app-secrets created/updated from ${ENV_FILE}"
echo "  (values in the cluster only — nothing written to the repo)"

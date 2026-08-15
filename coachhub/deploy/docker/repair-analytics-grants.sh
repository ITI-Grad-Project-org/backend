#!/bin/sh
# Dev counterpart to deploy/k8s/30-migrations/analytics-grants-job.yaml.
#
# WHY THIS EXISTS
# create-databases.sh only runs on the FIRST init of an empty postgres volume.
# A dev volume created before analytics-service was pointed at core_db therefore
# never received the grants, and analytics-service fails every request with:
#
#     FATAL: permission denied for database "core_db"
#     DETAIL: User does not have CONNECT privilege.
#
# `docker compose down -v` also fixes it, by destroying all local data. This
# script is the non-destructive option: it brings an existing volume up to what
# create-databases.sh would have produced, and is a no-op on one already correct.
#
# Usage (from the compose project root, with the stack running):
#     sh deploy/docker/repair-analytics-grants.sh
set -eu

COMPOSE="${COMPOSE:-docker compose}"
PSQL="$COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U ${POSTGRES_SUPERUSER:-postgres}"

$PSQL -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'analytics_user'" \
    | grep -q 1 || {
        echo "FATAL: role analytics_user does not exist — this volume was never" >&2
        echo "       provisioned by create-databases.sh. Use: docker compose down -v" >&2
        exit 1
    }

$PSQL -d postgres -c "GRANT CONNECT ON DATABASE core_db TO analytics_user;"

# core_user is granted CREATE before the revoke so a hand-repaired database,
# where core_user may be relying on PUBLIC's CREATE, cannot end up unable to
# create its own tables. See the Job manifest for the full reasoning.
$PSQL -d core_db <<'EOSQL'
GRANT USAGE, CREATE ON SCHEMA public TO core_user;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO analytics_user;
GRANT SELECT ON ALL TABLES    IN SCHEMA public TO analytics_user;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO analytics_user;
ALTER DEFAULT PRIVILEGES FOR ROLE core_user IN SCHEMA public
    GRANT SELECT ON TABLES TO analytics_user;
ALTER DEFAULT PRIVILEGES FOR ROLE core_user IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO analytics_user;
EOSQL

# Assert the outcome rather than trusting the exit codes above.
GRANTED=$($PSQL -d core_db -tAc \
    "SELECT DISTINCT privilege_type
       FROM information_schema.table_privileges
      WHERE grantee = 'analytics_user'
      ORDER BY 1" | tr -d '\r' | paste -sd, -)
if [ -n "$GRANTED" ] && [ "$GRANTED" != "SELECT" ]; then
    echo "FATAL: expected SELECT only on core_db, got $GRANTED" >&2
    exit 1
fi

$PSQL -d core_db -tAc "SELECT has_schema_privilege('analytics_user','public','CREATE')" \
    | tr -d '\r' | grep -qx f || {
        echo "FATAL: analytics_user still holds CREATE on schema public" >&2
        exit 1
    }
$PSQL -d core_db -tAc "SELECT has_schema_privilege('core_user','public','CREATE')" \
    | tr -d '\r' | grep -qx t || {
        echo "FATAL: core_user lost CREATE on schema public" >&2
        exit 1
    }

echo "analytics_user: CONNECT + SELECT on core_db, no CREATE. OK."

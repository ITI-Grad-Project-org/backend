#!/bin/sh
# Creates the two logical databases and their owners.
#
# TypeORM (core-api) and Hibernate (analytics-service) only manage schema
# INSIDE an existing database — neither can create databases or roles, so this
# must run before any app connects. The official postgres image executes it
# from /docker-entrypoint-initdb.d ONLY on first init of an empty data volume
# (to re-run in dev: docker compose down -v).
#
# It is a .sh (not .sql) so the passwords come from the container environment:
# requires CORE_DB_PASSWORD and ANALYTICS_DB_PASSWORD.
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

    -- analytics-service reports on core-api's live data. Postgres cannot join
    -- across databases, so it connects to core_db directly rather than copying
    -- rows into analytics_db. Read-only: the SELECT grants are applied below,
    -- and analytics_user never receives INSERT/UPDATE/DELETE on core_db.
    GRANT  CONNECT ON DATABASE core_db      TO analytics_user;
EOSQL

# Postgres 15+: the public schema is no longer world-writable; hand each one
# to the database owner explicitly.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname core_db \
    -c 'ALTER SCHEMA public OWNER TO core_user;'
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname analytics_db \
    -c 'ALTER SCHEMA public OWNER TO analytics_user;'

# Read-only grants for analytics_user inside core_db.
#
# ALTER DEFAULT PRIVILEGES is the load-bearing statement: core-api creates its
# tables at runtime (TypeORM synchronize in dev, the migration Job in K8s), all
# as core_user. Granting SELECT only on the tables that exist right now would
# leave every table created afterwards invisible to analytics — which, on a
# first init against an empty database, is all of them.
#
# The REVOKE is not redundant with the SELECT-only table grants: schema-level
# CREATE is a separate privilege, and a role holding it can add its own tables
# to core_db regardless of how little it may read. Postgres 15+ already drops
# CREATE from PUBLIC by default, so this is a no-op on a fresh init — it is here
# so the invariant is asserted by this file rather than inherited from a version
# default that an older or hand-repaired database may not match.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname core_db <<-EOSQL
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO analytics_user;
    GRANT SELECT ON ALL TABLES    IN SCHEMA public TO analytics_user;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO analytics_user;
    ALTER DEFAULT PRIVILEGES FOR ROLE core_user IN SCHEMA public
        GRANT SELECT ON TABLES TO analytics_user;
    ALTER DEFAULT PRIVILEGES FOR ROLE core_user IN SCHEMA public
        GRANT SELECT ON SEQUENCES TO analytics_user;
EOSQL

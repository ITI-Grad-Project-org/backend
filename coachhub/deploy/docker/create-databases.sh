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

    -- No cross-database access: each user may connect only to its own DB.
    REVOKE CONNECT ON DATABASE core_db      FROM PUBLIC;
    REVOKE CONNECT ON DATABASE analytics_db FROM PUBLIC;
    GRANT  CONNECT ON DATABASE core_db      TO core_user;
    GRANT  CONNECT ON DATABASE analytics_db TO analytics_user;
EOSQL

# Postgres 15+: the public schema is no longer world-writable; hand each one
# to the database owner explicitly.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname core_db \
    -c 'ALTER SCHEMA public OWNER TO core_user;'
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname analytics_db \
    -c 'ALTER SCHEMA public OWNER TO analytics_user;'

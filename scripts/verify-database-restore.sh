#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_TEST_DATABASE_URL:?Set a disposable restore database URL}"
if [[ "${CHECKSQUARE_DISPOSABLE_DB:-}" != 1 ]]; then echo 'Refusing restore without CHECKSQUARE_DISPOSABLE_DB=1' >&2; exit 1; fi
archive=${1:?Pass a database archive path}
existing=$(psql "$RESTORE_TEST_DATABASE_URL" -XAt -v ON_ERROR_STOP=1 -c "select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema')")
if [[ "$existing" != 0 ]]; then echo 'Refusing restore: target database is not empty.' >&2; exit 1; fi
sha256sum --check "$archive.sha256"
pg_restore --dbname="$RESTORE_TEST_DATABASE_URL" --no-owner --no-acl --exit-on-error "$archive"
psql "$RESTORE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "select 'profiles' as table_name,count(*) from public.profiles union all select 'inspections',count(*) from public.inspections union all select 'appointments',count(*) from public.appointments"

#!/usr/bin/env bash
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a fresh disposable PostgreSQL database}"
if [[ "${CHECKSQUARE_DISPOSABLE_DB:-}" != "1" ]]; then
  echo 'Refusing to bootstrap without CHECKSQUARE_DISPOSABLE_DB=1' >&2
  exit 1
fi
cd "$(dirname "$0")/.."
existing=$(psql "$TEST_DATABASE_URL" -XAt -v ON_ERROR_STOP=1 -c "select count(*) from pg_namespace where nspname in ('auth','storage')")
if [[ "$existing" != "0" ]]; then
  echo 'Refusing to bootstrap an existing database. Use a new empty test database.' >&2
  exit 1
fi
psql "$TEST_DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql
if [[ "${1:-}" == "--cloud" ]]; then
  psql "$TEST_DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -f supabase/cloud_apply.sql
else
  psql "$TEST_DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -f supabase/migrations/001_schema.sql
  psql "$TEST_DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -f supabase/policies/001_rls.sql
  psql "$TEST_DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -f supabase/migrations/002_auth_and_storage.sql
fi
for migration in supabase/migrations/00{3,4,5}_*.sql supabase/migrations/*_reconcile_hosted_schema.sql; do
  psql "$TEST_DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -f "$migration"
done
# Verify the latest migration can be repeated without replaying older revisions.
for migration in supabase/migrations/*_reconcile_hosted_schema.sql; do
  psql "$TEST_DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -f "$migration"
done
for test in supabase/tests/profile_role_security.sql supabase/tests/workflow_permissions.sql supabase/tests/release_integrity.sql; do
  psql "$TEST_DATABASE_URL" -Xq -v ON_ERROR_STOP=1 -f "$test"
done

# Supabase production setup

CheckSquare uses Supabase as its only production backend. PocketBase is not part of the runtime, authentication flow, or deployment path. The legacy PocketBase files remain only as historical migration material and must not be configured for a release.

| Concern | Supabase component |
|---|---|
| Authentication and sessions | Supabase Auth |
| Application data and RBAC | Postgres tables with RLS |
| Photos and reports | Private Storage buckets with signed URLs |
| Realtime updates | Postgres changes channels |
| Admin user provisioning | `admin-user-management` Edge Function |

## 1. Create and configure the project

1. Create a Supabase project in the region closest to users.
2. Copy the project URL and public anon key into the web build environment.
3. Keep the service-role key server-side only. It is required by the admin Edge Function and must never be included in `VITE_*` variables.
4. Enable email/password Auth. Configure Google OAuth or magic links only if those flows are part of the release scope, and add every deployed origin to the Auth redirect allow-list.

## 2. Apply the database and security model

Run the schema and policies against the target staging project first, then production after verification:

```bash
# Fresh database: cloud_apply.sql includes the schema, policies and auth glue.
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/cloud_apply.sql
# Then apply 003, 004 and 005, as shown below.

# Existing database: apply incremental security migrations only.
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/003_profile_role_security.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/004_workflow_permissions.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/005_release_integrity.sql
```

The policies enable RLS and protect role changes, inspection ownership, appointment assignment, report publication, private media, and customer data. Do not bypass RLS from the browser.

## 3. Configure Storage

Create private buckets named `inspection-photos` and `reports`. Apply the Storage policies from `supabase/migrations/001_schema.sql` or the Supabase dashboard. The app uploads photos locally first, queues failed uploads for retry, and uses short-lived signed URLs for reads.

Recommended limits:

- image MIME types: JPEG, PNG, WebP, HEIC/HEIF where supported
- maximum image size: 25 MB before client-side resizing
- report downloads: private, user-owned paths

## 4. Configure environment variables

For `apps/web`, set these at build time in local, staging, and production separately:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public-anon-key>
```

The app fails clearly when these values are absent; it does not switch to another backend. Server-side Edge Function secrets are configured in Supabase, never in the browser bundle.

## 5. Deploy the admin function

```bash
supabase functions deploy admin-user-management
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<server-only-key>
```

The function verifies the caller JWT, requires an admin profile, prevents self-deletion, and creates/deletes Auth users. Test it in staging with synthetic accounts before enabling Admin User Management in production.

## 6. Seed isolated test accounts

Create one synthetic account for each role through Supabase Auth and the `profiles` table, or use a staging-only seed script. Never use real customer/property data for verification. Confirm that each account can see only its permitted rows.

## 7. Verification checklist

Run from the repository root:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run lint --workspace apps/web
npm run build --workspace apps/web
git diff --check
```

Then manually verify in staging:

- customer signup/login/logout and session expiry
- admin creates users and assigns appointments
- inspector sees only assigned appointments, saves drafts, uploads offline, and submits
- admin review/approve/reject changes are visible to the inspector and customer
- customer sees only their own property, defects, photos, and approved reports
- direct API requests using another user's IDs are rejected by RLS
- private Storage URLs expire and cannot be reused for another object
- repeated taps and refreshes do not duplicate appointments, reports, or messages

## 8. Release configuration

Before release, record the exact Supabase project, migration revision, web commit, app version, redirect URLs, Storage policies, Edge Function version, and rollback procedure. Enable Auth audit logs, database backups/PITR, Edge Function logs, and client crash reporting.

A successful local build does not prove production readiness. Staging must use real Supabase Auth, RLS, Storage, realtime, and Edge Functions with test accounts.

## 9. Legacy data

If historical PocketBase data must be retained, migrate it once with a reviewed, one-way export/import process into staging, verify counts and ownership, then archive the export securely. Do not restore PocketBase as a runtime dependency and do not point production clients at it.

## 10. Current verification and remaining release work

The 2026-10-18 changes include a labelled private preview, ten focused Node tests, rollback-only SQL security/lifecycle tests, web/database CI, and a separate Android staging-build workflow. The SQL suite passes in an isolated PostgreSQL-compatible WASM runtime on both base-schema paths. Hosted Supabase APIs and a physical Android device have not been verified in this environment.

Apply migrations to staging before serving the new live web build: it requires the `persist_inspection` RPC and `version` column. Deploy `admin-user-management` with reset-password support at the same time. Create private `avatars` storage using migration 005. Staging/production must never set `VITE_DEMO_MODE`.

Production dependency audit has no high/critical findings after compatible upgrades and removal of the unused SheetJS dependency and retired native asset generator. Two moderate ExcelJS/UUID findings remain; the app uses ExcelJS for trusted report export, not importing arbitrary workbooks. Full development audit additionally reports legacy Tailwind 3 compiler dependency findings. The full report is retained by CI; these findings are not declared fixed. A Tailwind 4 migration requires separate visual verification.

## 11. Operations and rollback

- Enable Supabase project backups/PITR appropriate to the account. `scripts/backup-database.sh` creates a private database archive and checksum. It requires `SUPABASE_DB_URL` and PostgreSQL tools; it was not run against a real project here. Database archives exclude Storage object bytes. Back up `inspection-photos`, `reports` and `avatars` separately using the project's Storage export procedure.
- `scripts/verify-database-restore.sh <archive>` restores only to an explicitly disposable, empty database and checks core row counts. It refuses an occupied target. Complete a staging restore drill, including Storage bytes and authenticated reads, before calling backups verified.
- `inspection_events` records review transitions, actor IDs and versions. `client_error_events` records authenticated render/unhandled error codes and route templates, capped at 20 per user per minute. It excludes report contents, tokens, user messages and query strings. Admins can inspect these tables in Supabase; configure alerts and retention in the actual project.
- CI retains the web bundle by commit. For a frontend rollback, redeploy the last verified bundle and record its commit. Keep additive database migrations in place; do not blindly drop columns/functions or restore production over newer data. First reproduce any database rollback in staging and preserve a fresh database plus Storage backup.
- A signed Android rollback/update must use the existing release key and a valid increasing Android version code. No signing credentials were available here.

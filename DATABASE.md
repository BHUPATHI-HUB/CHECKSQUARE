# CheckSquare database

Supabase Auth owns identity; `public.profiles` stores application roles. Browser clients use the public anon key plus the signed-in user's JWT. RLS and database triggers enforce access.

The authoritative definitions are:

- `supabase/migrations/001_schema.sql`: tables and enums.
- `supabase/policies/001_rls.sql`: base row policies.
- `supabase/migrations/002_auth_and_storage.sql`: Auth profile triggers and media policies.
- `003_profile_role_security.sql`: trusted role provisioning and self-escalation prevention.
- `004_workflow_permissions.sql`: appointment/report mutation restrictions.
- `005_release_integrity.sql`: schema parity, explicit grants, private-media isolation, versioned report saves, atomic appointment linkage, review stamps, audit events, notifications, support chats, private avatars and client-error events.

`supabase/cloud_apply.sql` is the alternative fresh-project base. **Apply 003, 004 and 005 afterward**. Do not run a fresh base script on a populated project. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

Customers book unassigned appointments and see only their approved reports. Admins assign staff before work starts. Inspectors capture and submit their own reports. A report save links its appointment in the same transaction. Approval completes the appointment and publishes the report; rejection requires feedback. Server-stored actor IDs, status events and notifications commit with the review. Version checks reject stale clients rather than overwriting newer data.

`persist_inspection` is the application write boundary. Its security-invoker mode retains RLS. Photo paths use `<staff UUID>/<report UUID>/<room>/<photo>`; old report-keyed paths remain ownership-gated. There is no shared `draft/` read permission.

For isolated tests, use a new empty PostgreSQL 17 database:

```bash
CHECKSQUARE_DISPOSABLE_DB=1 TEST_DATABASE_URL='postgres://…' scripts/test-database.sh
```

The runner refuses an existing Auth/Storage schema. It supplies minimal platform contracts, applies the actual migrations, checks repeatability and runs rollback-only role/workflow/media tests. These tests do not replace hosted Auth, Storage, realtime or Edge Function verification.

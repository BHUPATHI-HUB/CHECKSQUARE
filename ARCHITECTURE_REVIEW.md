# CheckSquare Architecture and Maintainability Review

## Verdict

The project has a solid product foundation and a thoughtful attempt at local-first APK support, but it is not yet a low-risk production architecture. It is best described as an advanced beta: the UI and feature coverage are strong, while security enforcement, backend consistency, offline durability, and automated verification need another hardening phase.

Overall assessment: **5.5/10 for production maintainability today**.

## Current architecture

- **Frontend:** React 18, Vite, React Router, Tailwind/shadcn UI, lazy-loaded pages.
- **Primary backend:** PocketBase with SQLite, migrations, hooks, file storage, and collection rules.
- **Optional backend:** Supabase Auth, Postgres, Storage, and Edge Functions.
- **Runtime targets:** normal web, offline-admin, and hybrid APK.
- **Local persistence:** IndexedDB/local storage in the browser and Capacitor filesystem/native storage on Android.
- **Domain areas:** authentication/RBAC, inspections, photos, reports, appointments, chat, notifications, settings, and downloads.

The main architectural strength is the direction toward adapters (`dataService`, local stores, photo storage, sync engine). The main architectural weakness is that multiple backends and runtime targets are still exposed throughout the application, so the effective system has several partially different products sharing one UI.

## What is good

1. Feature boundaries are recognizable: authentication, settings, chat, inspections, reporting, and persistence have dedicated contexts/services.
2. Routes and large screens are lazy-loaded, which keeps the initial bundle manageable.
3. PocketBase schema is represented as migrations and the database directory is correctly protected from source control.
4. The APK work correctly moves heavy inspection/photo/report work toward local storage and avoids uploading every large image during capture.
5. Report generation is centralized, which gives PDF/DOCX output a single place to evolve.
6. Backup and local-run documentation is unusually complete for a project of this size.
7. The recent local-storage changes make several write failures visible instead of silently reporting success.

## Priority findings

### P0 — Fix before production

**Role escalation remains possible in the PocketBase model.** The original users rules permit client-controlled profile writes, while `role` is a field on that record. A malicious user must never be able to promote their own record to `admin`. Review [1779700001_users_admin_manage.js](apps/pocketbase/pb_migrations/1779700001_users_admin_manage.js) and the new security migration together; test the final rules against create, update, and role-change requests.

**Supabase role handling has the same class of risk.** Do not copy an authorization role from user-editable auth metadata into a trusted profile, and do not permit profile self-update to change role. Supabase documents that user metadata is editable by the user: https://supabase.com/docs/guides/auth/users. Enforce role changes in a server-side function or trigger with an explicit admin check.

**The new security migrations are not verified against a running backend.** `apps/pocketbase/pb_migrations/1789000001_secure_roles_and_workflow.js` and `supabase/migrations/003_security_and_app_support.sql` should be treated as drafts until applied in a disposable environment and tested. Pay particular attention to PocketBase rule syntax, trigger recursion/privileges, and storage owner types.

### P1 — Fix before broad APK rollout

**Approval workflow is not a complete server-side state machine.** Inspector/customer clients should not be able to set arbitrary status, approval, or rejection fields. Define allowed transitions (for example `draft → submitted → approved/rejected`) and enforce actor, role, and previous state on the server.

**There are still two data backends.** PocketBase is documented as the system of record, but Supabase paths also exist and some components still call PocketBase directly. This makes behavior dependent on environment flags and makes a migration incomplete. Select one canonical backend and hide the other behind a small, typed repository interface.

**Sync semantics are incomplete for the hybrid target.** The local outbox, remote IDs, retries, idempotency, conflict handling, and photo upload lifecycle need one explicit contract. Do not rely on backend-specific IDs or assume that a queued record can be safely retried without an idempotency key.

**Offline durability needs a failure model.** IndexedDB and native filesystem writes must be transactional from the user’s perspective. Every capture/save operation needs a durable local status (`pending`, `saved`, `failed`) and a recovery UI. A report should not appear downloadable until its bytes and metadata are confirmed.

**Photo handling has several storage representations.** Legacy base64, remote URLs, signed storage keys, and local file paths coexist. Normalize these into one `PhotoRef` type and resolve it through one renderer/materializer. This is especially important for report generation, where signed URLs can expire during a long export.

### P2 — Maintainability improvements

**The frontend is too large for one undifferentiated application layer.** `ReportGenerator.jsx` is roughly 4,100 lines and several contexts contain backend and UI policy together. Split by domain and move validation/state transitions into pure modules.

**Direct PocketBase calls remain in many components.** This defeats the intended adapter architecture and makes Supabase or offline behavior inconsistent. Components should call domain repositories/hooks only.

**Chat attachments and message updates need contract tests.** FormData, file metadata, realtime updates, and authorization differ between PocketBase and Supabase; these paths are easy to regress.

**The unsaved-change guard now depends on React Router’s data-router blocker.** It is directionally correct, but needs browser and Android back-button tests for navigation, refresh, deep links, and cancellation. Keep navigation policy out of `ProtectedRoute`.

**The project has little automated coverage.** Lint and production build pass, but there is no meaningful unit, integration, or end-to-end suite for auth/RBAC, offline capture, queue retries, photo recovery, approval transitions, or report exports.

## Validation performed

- `npm.cmd run lint --workspace apps/web` — completed without reported errors.
- `npm.cmd run build --workspace apps/web` — passed with Vite production output.
- Repository contains 218 tracked files and 124 frontend source files.
- Working tree contains uncommitted app-support and security changes. They are not yet a reviewed release commit.

## Recommended target architecture

1. Choose **PocketBase or Supabase as the single production system of record**. Keep the other only in a separately named migration tool or feature branch.
2. Organize code into `domain/`, `repositories/`, `storage/`, `sync/`, and `ui/`. UI code should not import PocketBase, Supabase, or Capacitor APIs directly.
3. Give every local mutation a durable operation ID, entity ID, schema version, retry count, and server acknowledgement. Make server writes idempotent.
4. Define inspection and approval transitions as a pure state machine and enforce the same transition table in backend rules/functions.
5. Use one normalized schema for `Inspection`, `PhotoRef`, `ReportFile`, and `Appointment`; map backend naming differences only inside repositories.
6. Add automated tests in this order: authorization matrix, state transitions, local persistence failure/recovery, sync retry/idempotency, photo materialization, then Playwright/Cypress critical flows.
7. Add observability for sync failures, export failures, storage quota, and unhandled promise rejections. Keep sensitive image content and tokens out of logs.
8. Build APKs in CI as release artifacts. Never commit `android/`, APKs, keystores, `pb_data/`, or backups.

## Release gate

Before calling this production ready, require: verified role/approval penetration tests on both backends, a disposable migration test, offline capture with device restart and low storage, retry after network loss, duplicate-submit tests, photo/report export tests, and a signed APK smoke test on at least two Android versions.


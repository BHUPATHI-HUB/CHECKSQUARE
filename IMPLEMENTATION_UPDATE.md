# CheckSquare implementation update

## Delivered in this slice

- Hybrid APK inspections remain local first while online web builds keep their existing cloud adapter.
- Submitted hybrid inspections are placed in a deduplicated local outbox and sent to the configured cloud adapter when connectivity is available.
- Approval and rejection use a status-only mutation. The approval action no longer re-sends the complete inspection payload or its photos.
- Repeated edits collapse to one pending full inspection write per inspection.
- Repeated approval/rejection changes collapse to one pending status transition.
- Hybrid photo uploads can enter the existing local blob queue and are uploaded in controlled batches.
- Admin settings now include a device sync policy: on submit/reconnect, Wi-Fi only, or manual sync; photo batch size is configurable.
- Automatic sync obeys that policy. Retry remains an explicit forced action.
- Hybrid inspection chat auto-provisioning is deferred until cloud inspection sync is available.

## Verification

- `npm run lint --workspace apps/web` — passed.
- `npm run build --workspace apps/web` — passed.
- PocketBase health probe `http://127.0.0.1:8090/api/health` — HTTP 200.
- Frontend probe `http://localhost:3000/login` — HTTP 200 and React root present.
- `git diff --check` — passed.

## Current data-flow boundary

The initial hybrid submit still sends one full inspection record because the cloud needs the inspection itself. Subsequent approval or rejection is a small status patch. Photo uploads remain independently queued and batched.

Before calling hybrid cloud sync production-complete, draft photo storage keys should be made user-scoped and stable before the first capture. This is required for Supabase Storage RLS and for photos captured before an inspection ID exists; it is intentionally left as the next bounded migration instead of being hidden behind a false completion claim.


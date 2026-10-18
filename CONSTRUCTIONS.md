# CheckSquare architecture and workflow

CheckSquare is a React 18 + Vite web/PWA application packaged with Capacitor Android. Supabase supplies Auth, PostgreSQL with RLS, private Storage, realtime and the admin user-management Edge Function. The PocketBase directory is archived migration material.

- `apps/web/src/App.jsx`: role-guarded routes and shared providers.
- `contexts/AuthContext.jsx`: password authentication, profile loading, offline profile cache and session handling.
- `services/dataService.js`: Supabase data boundary and camelCase/database mappings.
- `components/InspectionForm.jsx`: five-phase capture and stable report identity.
- `lib/localStore.js`, `services/syncEngine.js`: durable IndexedDB photo/report queue, account-scoped upload and retry.
- `components/AdminAppointmentsPanel.jsx`: assignment and appointment queue.
- `utils/ReportGenerator.jsx`, `utils/ExcelReportGenerator.js`: PDF, DOCX and Excel exports.
- `supabase/migrations/005_release_integrity.sql`: transactional handoff, lifecycle, optimistic version checks and review events.

Customer booking creates an unassigned appointment. Admin assigns an inspector. The inspector opens that appointment and captures a draft with its appointment ID. Saving atomically creates/updates the report and links the booking. The inspector submits; admin approves or rejects with feedback. Approval publishes the report to that customer and completes the booking. Rejected reports can be corrected and resubmitted.

Offline saves confirm only after report/photo bytes and retry operations commit on the device. Reconnection and foreground events retry under the originating account. Saved report revisions protect edits made while earlier uploads are in flight. A successful upload keeps local image bytes for offline viewing. Backend conflicts remain queued for attention rather than overwriting newer data.

The private sample-data preview is built with `VITE_DEMO_MODE=true` and has an amber banner with role switches. It has no production connection and is separate from live verification.

The customer profile route remains a dashboard redirect. Cloud Auth providers, private bucket delivery, realtime, signed Android releases and actual devices must be tested in staging before release.

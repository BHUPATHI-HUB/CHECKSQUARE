# Supabase Full-Migration Task List

Started: Jan 2026

## Phase 1 — Side-car (Storage + Auth) ✅
- [x] Supabase client (`apps/web/src/lib/supabaseClient.js`)
- [x] Photo storage helper (`apps/web/src/lib/supabasePhotoStorage.js`)
- [x] PB hook: signed-upload (`apps/pocketbase/pb_hooks/supabase-storage.pb.js`)
- [x] PB hook: OAuth bridge (`apps/pocketbase/pb_hooks/supabase-oauth-bridge.pb.js`)
- [x] SupabaseAuthContext (additive Google + magic-link)
- [x] Google sign-in button on LoginPage
- [x] App.jsx provider wiring
- [x] RoomPhotoManager: base64 → Supabase + PhotoImg resolver
- [x] supabase/migrations + supabase/policies SQL
- [x] seed-test-users.mjs script
- [x] SUPABASE_SETUP.md

## Phase 2 — High-value PB-side cleanups ✅
- [x] Extract `PhotoImg` to its own file; reuse in RoomSpaceGallery, InspectionDetailView, AdminInspectionDetailModal
- [x] PB migration: tighten `users.listRule` (close gap S1, the PII leak)
- [x] Move `app_settings` from localStorage → PocketBase `app_settings` collection (close gap A2)
- [x] Wire ReportGenerator through `materializeInspectionPhotos()` so PDF/DOCX embed photo bytes
- [x] **Image cropping fix** — switched every inspection photo from `object-cover` to `object-contain` (CSS) and from center-crop to scale-to-fit (canvas) in PDF/DOCX. Decorative cover photos kept as `cover`. (User-reported bug)

## Phase 3 — Full Supabase database cutover ✅ (Plumbing complete)
- [x] Data service abstraction (`apps/web/src/services/dataService.js`)
- [x] Supabase Auth context (additive Google + magic-link)
- [x] Postgres trigger to sync `auth.users` → `public.profiles`
- [x] Storage RLS policies for `inspection-photos` bucket
- [x] Realtime channel helper (Supabase channels replacement)
- [x] One-shot data migration script (`scripts/migrate-pb-to-supabase.mjs`)
- [x] **Page-by-page rewrite of `pb.collection(...)` → `dataService(...)`** ✅
  - [x] AdminDashboard.jsx (chats lookup)
  - [x] AdminUserManagementPage.jsx (6 user CRUD calls)
  - [x] AppointmentBookingPage.jsx (inspectors list + appointment create + chats)
  - [x] CustomerDashboard.jsx (admins list + appointments + inspections)
  - [x] DownloadsPage.jsx (list + download URL + delete)
  - [x] AdminInspectionDetailModal.jsx (get + update inspection)
  - [x] AdminDownloadReport.jsx (hydrate full inspection)
  - [x] DeletedReportsArchive.jsx (full-fetch archive)

## Remaining (smaller — context-level / auth-specific)
The following still use `pb.collection(...)` directly because they're either
auth-specific (must stay PB until Supabase Auth is the primary identity) or
extremely tightly coupled to PB realtime semantics:

- AuthContext.jsx — login / signup / authRefresh / passwordReset. **Reason:**
  auth is the trickiest piece; switch only when Phase-3 cutover is final.
- ChatContext.jsx — chats / messages list + realtime subscribe + sendMessage
  with FormData attachments. **Reason:** dataService has the methods but the
  legacy realtime channel name (`pb.collection('messages').subscribe(...)`)
  is fine to leave until the cutover.
- saveFile.js — uses pb.send for download logging.
- useInspectionStatus.js — pb subscriptions for status changes.
- InspectionForm.jsx — autosave drafts to `pb.collection('inspections')`.
- InspectionViewPage.jsx — same.
- NewInspectionPage.jsx — same.
- InspectorDashboard.jsx — own inspections + appointments.
- InspectionDetailView.jsx — approve / reject.
- AdminApprovalActions.jsx — approve / reject.

These all use a small set of methods (getInspection, listInspections,
createInspection, updateInspection, listChats, sendMessage) which are
already exposed by `dataService`.  Refactoring each one is a 5-minute
mechanical search-replace — left for the cutover sprint so a single
test pass can verify the entire app switches cleanly.

## How to push to GitHub

The full Phase-1 + Phase-2 + Phase-3 plumbing + Image-fix + Page refactor is
committed locally in /app.  To push to BHUPATHI-HUB/CHECKSQUARE:

  → **Click "Save to GitHub"** in the Emergent chat input box.

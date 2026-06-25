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

## Phase 2 — High-value PB-side cleanups
- [x] Extract `PhotoImg` to its own file; reuse in RoomSpaceGallery, InspectionDetailView, ReportGenerator
- [x] PB migration: tighten `users.listRule` (close gap S1, the PII leak)
- [x] Move `app_settings` from localStorage → PocketBase `app_settings` collection (close gap A2)

## Phase 3 — Full Supabase database cutover (started)
- [x] Data service abstraction (`apps/web/src/services/dataService.js`)
- [x] Supabase Auth context (replaces PB auth when `VITE_USE_SUPABASE_DB=true`)
- [x] Postgres trigger to sync `auth.users` → `public.profiles`
- [x] Storage RLS policies for `inspection-photos` bucket
- [x] Realtime channel helper for chat (Supabase channels replacement)
- [x] One-shot data migration script (`scripts/migrate-pb-to-supabase.mjs`)
- [x] Documentation in `SUPABASE_SETUP.md` §13 (cutover playbook)
- [ ] Per-page rewrite of `pb.collection(...)` → `dataService(...)` — left as a documented, prioritised follow-up because the change touches ~18 React components (~6 KLoC) and would not finish in this session. The Phase 3 plumbing is now ready for that work to land safely as a series of small PRs.

## Done in this session
Move repo into /app, apply Phase 1 patch, execute Phase 2 + Phase 3 plumbing, push to GitHub via the Save-to-Github button.

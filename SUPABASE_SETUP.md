# Supabase Side-Car Setup Guide

This guide configures the Phase-1 Supabase integration for CheckSquare:

| Concern | Where it lives now |
|---|---|
| **Photo storage** | Supabase Storage (private bucket `inspection-photos`) |
| **Optional Google OAuth + magic-link** | Supabase Auth → bridged to PocketBase via JS hook |
| **System of record** (data, RBAC, realtime) | **Still PocketBase** — unchanged |

Read [/CHECKSQUARE_GAP_ANALYSIS.md](/CHECKSQUARE_GAP_ANALYSIS.md) (in the analysis output) for the full architectural rationale.

---

## 1. Create the Supabase project (5 min)

1. Sign up free at https://supabase.com/dashboard.
2. **New project** → choose a region close to your users (e.g. `Mumbai (ap-south-1)` for India) → set a DB password → wait ~2 min for provisioning.
3. Open **Project Settings → API**.  Copy these four values into a sticky note — you'll paste them below:
   - `Project URL`           → maps to `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon` `public` key     → maps to `VITE_SUPABASE_ANON_KEY`
   - `service_role` `secret` → maps to `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **server-only — never expose to the browser**
   - `JWT Secret` (under JWT settings) → maps to `SUPABASE_JWT_SECRET` (used by the OAuth bridge later)

---

## 2. Create the photo bucket

In the Supabase Dashboard:

1. **Storage → New bucket**.
2. Name: `inspection-photos`.
3. **Public bucket**: **OFF** (keep it PRIVATE — the PocketBase hook will mint short-lived signed URLs).
4. **File size limit**: 25 MB.
5. **Allowed MIME types**: `image/jpeg, image/png, image/webp, image/heic, image/heif`.
6. Create.

That's it — no Storage RLS policy edits needed for Phase 1, because writes go through service-role from the PB hook and reads use signed URLs only.

---

## 3. (Optional) Enable Google OAuth

1. Supabase Dashboard → **Authentication → Providers → Google → Enable**.
2. Follow the Supabase prompt — you'll need a Google OAuth client ID + secret from https://console.cloud.google.com/apis/credentials:
   - Application type: **Web application**.
   - **Authorised redirect URI**: copy the one Supabase displays (looks like `https://<ref>.supabase.co/auth/v1/callback`).
3. Paste the Google client id + secret back into Supabase → **Save**.
4. Under **Authentication → URL Configuration**, add to **Redirect URLs**:
   - `http://localhost:3000/login`
   - `https://checksquare.pages.dev/login`  (and any other deployed origin)

Email + password works out of the box — no extra setup.

---

## 4. Wire env vars

### 4.1 Web app (`apps/web/.env.local` for dev, Cloudflare Pages env vars for prod)

```dotenv
VITE_PB_URL=http://127.0.0.1:8090            # unchanged
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...                # anon, public key
```

Leave both `VITE_SUPABASE_*` empty to **disable** Supabase — the app then runs in the same PocketBase-only mode as before (graceful fallback in `lib/supabaseClient.js`).

### 4.2 PocketBase host (Fly.io secrets / Hostinger panel / local shell)

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...             # SECRET — never to the browser
SUPABASE_PHOTO_BUCKET=inspection-photos      # optional, this is the default
SUPABASE_DEFAULT_ROLE=customer               # new OAuth signups get this role
```

For Fly.io:
```bash
fly secrets set -a checksquare-pb \
  SUPABASE_URL=https://xxx.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  SUPABASE_PHOTO_BUCKET=inspection-photos \
  SUPABASE_DEFAULT_ROLE=customer
```

For local dev (PowerShell):
```powershell
$env:SUPABASE_URL='https://xxx.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='eyJ...'
cd apps\pocketbase ; .\pocketbase.exe serve --http=127.0.0.1:8090
```

---

## 5. Install dependencies

```bash
yarn install                                 # picks up @supabase/supabase-js from the workspace root
```

The package was added to `apps/web/package.json` in this PR.

---

## 6. Seed test users (creates the SAME 3 accounts in PB + Supabase)

```bash
PB_URL=http://127.0.0.1:8090 \
PB_SUPERUSER_EMAIL=admin@example.com \
PB_SUPERUSER_PASSWORD='YourSuperPwd!23' \
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/seed-test-users.mjs
```

After it finishes you'll have **all three roles** ready to sign in:

| Email | Password | PocketBase role |
|---|---|---|
| `admin.test@checksquare.dev`     | `AdminPass!23`     | `admin` |
| `inspector.test@checksquare.dev` | `InspectorPass!23` | `inspector` |
| `customer.test@checksquare.dev`  | `CustomerPass!23`  | `customer` |

Re-run the script any time — it upserts rather than duplicates.

---

## 7. End-to-end test — Storage

1. `npm run dev` (root) — starts PocketBase **and** the web app together.
2. Sign in as the inspector test user → **New inspection** → start a room → **Capture / Upload** any photo.
3. Confirm in the browser DevTools **Network** tab:
   - A `POST /api/supabase/signed-upload` call to PocketBase (returns `{ token, path }`).
   - A `PUT https://<ref>.supabase.co/storage/v1/object/upload/sign/...` (returns 200).
4. In Supabase Dashboard → **Storage → inspection-photos** you should see the file under `draft/<roomKey>/<photoId>.jpg`.
5. The inspection JSON now stores `{ id, storageKey, capturedAt }` — **no more base64**.
6. Re-open the same inspection — the photo loads via a freshly minted signed URL (1 h TTL).

If anything fails the helper falls back to the legacy base64 path, so the inspector never loses a photo while you debug.

---

## 8. End-to-end test — Google sign-in

1. Make sure §3 + §4 are done.
2. Open `/login` → you'll now see a **Continue with Google** button below the email form.
3. Click → choose your Google account.
4. You're redirected back to `/login`.  The Supabase session arrives in `sessionStorage`.  The `SupabaseAuthProvider` automatically POSTs the Supabase access token to `/api/supabase/oauth-bridge` on the PocketBase server.
5. The PB hook verifies the token, finds-or-creates the matching PB user (role defaults to `SUPABASE_DEFAULT_ROLE`), and returns a PB auth token.
6. The React app loads that token into `pb.authStore` → existing `AuthContext` picks it up → user is logged in with all role checks intact.

To promote a newly-OAuth'd user to `inspector` / `admin`, open the PocketBase admin UI → Collections → users → set `role`.

---

## 9. (Future) Phase 3 — full migration to Supabase Postgres

When you're ready to move OFF PocketBase entirely, the schema + RLS policies are already prepared:

```bash
# 1. Pipe the schema into Supabase
psql "$SUPABASE_DB_URL" -f supabase/migrations/001_schema.sql

# 2. Apply the row-level-security policies (mirrors PocketBase API rules)
psql "$SUPABASE_DB_URL" -f supabase/policies/001_rls.sql
```

Then port the React `pb.collection('inspections').*` calls to
`supabase.from('inspections').*`.  Realtime (`pb.collection('messages').subscribe(...)`)
maps directly to `supabase.channel('messages').on('postgres_changes', ...).subscribe()`.

The Phase-3 cutover is **a full follow-up project** and not required to ship Phase 1.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Photos still go in as base64 | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are empty at build time | Set them in Cloudflare Pages → Environment Variables, **redeploy** (Vite inlines them at build) |
| `POST /api/supabase/signed-upload` returns 500 | PB host is missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Re-run `fly secrets set ...` (or the equivalent for your host), then restart PocketBase |
| `POST /api/supabase/oauth-bridge` returns 403 "Email not verified" | OAuth provider didn't return a confirmed email | Verify your Google account email, or temporarily allow unverified by editing the hook (not recommended) |
| Photos upload but stay broken in `RoomSpaceGallery` / `InspectionDetailView` | Those two read-only views still expect `photo.url` | Patch them to use `<PhotoImg photo={...}>` from `RoomPhotoManager.jsx` (or extract `PhotoImg` to its own file) — TODO in Phase 1.1 |
| OAuth callback returns to `/login` but nothing happens | Supabase **Redirect URLs** allow-list missing your origin | Authentication → URL Configuration → add the origin |
| Want to disable Supabase quickly | Unset `VITE_SUPABASE_*` and redeploy | Frontend reverts to PocketBase-only (graceful fallback) |

---

## 11. Remaining frontend follow-ups (small, can be Phase 1.1)

These are not blockers — the app keeps working — but for a clean migration you'll want to:

- Extract `PhotoImg` from `RoomPhotoManager.jsx` to `apps/web/src/components/PhotoImg.jsx` and reuse in:
  - `apps/web/src/components/RoomSpaceGallery.jsx` (line 189)
  - `apps/web/src/components/InspectionDetailView.jsx` (lines 200, 228)
  - `apps/web/src/utils/ReportGenerator.jsx` (PDF/DOCX rendering of photos)
- The legacy `WebcamCaptureModal` produces base64 — wrap its `onCapture` so it calls `uploadInspectionPhoto` with the captured Blob.
- The PDF generator currently inlines `photo.url` directly into html2pdf — it must resolve signedKey → blob → dataURL before generating, otherwise the PDF will reference URLs that expire in 1 h.  (Easy fix: fetch the signed URL, then `URL.createObjectURL`.)

---

## 12. Cost reminder

Supabase free tier: 500 MB DB / 1 GB Storage / 2 GB bandwidth / 50K monthly active users / 500K Edge Function invocations.  Comfortable for a PoC.  Pro = $25/mo per project once you go live.

---

## 13. Phase-3 cutover playbook (full migration to Supabase)

This section is the runbook when you're ready to make Supabase the system of record and decommission PocketBase.  All the plumbing is already shipped — you just execute the steps below.

### 13.1  Apply the schema + policies + auth glue

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/001_schema.sql
psql "$SUPABASE_DB_URL" -f supabase/policies/001_rls.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/002_auth_and_storage.sql
```

### 13.2  Migrate the data

```bash
PB_URL=http://127.0.0.1:8090 \
PB_SUPERUSER_EMAIL=admin@example.com \
PB_SUPERUSER_PASSWORD='SuperPass!23' \
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/migrate-pb-to-supabase.mjs --dry-run        # see counts first
node scripts/migrate-pb-to-supabase.mjs                  # actually copy
```

Photos extracted from the legacy base64-in-JSON blobs are migrated separately — re-running `node scripts/seed-test-users.mjs` first ensures test users line up across both systems while you validate.

### 13.3  Flip the frontend

Set `VITE_USE_SUPABASE_DB=true` in your `.env` (or Cloudflare Pages env vars) and redeploy.  `apps/web/src/services/dataService.js` will route every CRUD call through Supabase instead of PocketBase.

### 13.4  What still needs to migrate to dataService

The Phase-3 plumbing is ready, but ~18 React components still call `pb.collection(...)` directly.  Each one is a small mechanical refactor:

| File | Calls to refactor |
|---|---|
| `apps/web/src/contexts/AuthContext.jsx` | login / signup / authRefresh / passwordReset |
| `apps/web/src/contexts/ChatContext.jsx` | chats + messages list / sub / send |
| `apps/web/src/pages/AdminDashboard.jsx` | inspections list, status filters |
| `apps/web/src/pages/AdminUserManagementPage.jsx` | users CRUD |
| `apps/web/src/pages/AdminSettingsPage.jsx` | already goes through SettingsContext — DONE |
| `apps/web/src/pages/AppointmentBookingPage.jsx` | inspectors list + appointments create |
| `apps/web/src/pages/InspectorDashboard.jsx` | own inspections + appointments |
| `apps/web/src/pages/NewInspectionPage.jsx` | create inspection |
| `apps/web/src/pages/InspectionViewPage.jsx` | get / update inspection |
| `apps/web/src/pages/DownloadsPage.jsx` | report_downloads list / delete |
| `apps/web/src/pages/CustomerDashboard.jsx` | customer's own data |
| `apps/web/src/pages/ChatPage.jsx` | chats / messages (already via context) |
| `apps/web/src/pages/LoginPage.jsx` | already via context — DONE |
| `apps/web/src/pages/SignupPage.jsx` | already via context — DONE |
| `apps/web/src/components/InspectionForm.jsx` | autosave drafts |
| `apps/web/src/components/InspectionDetailView.jsx` | approve / reject |
| `apps/web/src/components/AdminApprovalActions.jsx` | approve / reject |
| `apps/web/src/components/DeletedReportsArchive.jsx` | archived inspections |

The mechanical pattern, repeated:

```js
// before
const rows = await pb.collection('inspections').getFullList({ filter: 'status="pending"' });

// after
import data from '@/services/dataService.js';
const rows = await data.listInspections('status="pending"');
```

`dataService.js` is the only file that touches PB / Supabase directly — keep it that way.

### 13.5  Decommission PocketBase

Once the above is green for a week:

1. Set `VITE_PB_URL=` (empty) in production env vars.
2. Stop the PocketBase service (`fly apps suspend ...`).
3. Archive `pb_data/` to cold storage.

You're now 100% on Supabase.

---

## 14. Phase-2 cleanups already shipped in this branch

- **PhotoImg extracted** to `apps/web/src/components/PhotoImg.jsx` — single source for rendering legacy base64 OR storageKey photos.  Used in `RoomPhotoManager`, `RoomSpaceGallery`, `InspectionDetailView`.
- **ReportGenerator** now calls `materializeInspectionPhotos()` so PDFs/DOCXs embed photo bytes (signed URLs would expire mid-render).
- **users.listRule tightened** via migration `1779900001_tighten_users_and_app_settings.js` — closes gap S1 (PII leak).
- **app_settings collection** created in the same migration; `SettingsContext.jsx` now reads & writes through PocketBase with realtime sync across tabs + localStorage write-through as an offline cache — closes gap A2.


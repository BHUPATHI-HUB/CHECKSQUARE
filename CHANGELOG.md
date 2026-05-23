# InspectPro — Changelog

Tracks every change made off the original Hostinger Horizons export so they can be
selectively reverted before re-uploading to Hostinger.

Date format: YYYY-MM-DD. Hosting target: Hostinger Horizons (PocketBase served at `/hcgi/platform`).

---

## Legend

- 🟢 **KEEP** — change is portable; safe to ship to Hostinger as-is.
- 🟡 **OPTIONAL** — works on both; can be reverted if you want clean original config.
- 🔴 **LOCAL ONLY** — must be removed/excluded before uploading to Hostinger.

---

## 2026-05-22 — End-to-end refactor (mocks → PocketBase)

### Backend — new PocketBase migrations 🟢 KEEP

| File | Purpose |
|---|---|
| `apps/pocketbase/pb_migrations/1779500000_users_profile_fields.js` | Adds `role` (customer/inspector/admin), `name`, `phone`, `address` to the built-in `users` collection. Sets API rules so only the owner can update/delete, all authed users can list/view, public can sign up. |
| `apps/pocketbase/pb_migrations/1779500001_create_inspections.js` | New `inspections` collection — JSON fields for metadata/areas/water/rooms; approval workflow (`approvedBy/At`, `rejectedBy/At`, `rejectionReason`); soft-delete (`deletedAt/By`, `deletionReason`); role-scoped access rules; indexes. |
| `apps/pocketbase/pb_migrations/1779500002_create_appointments.js` | New `appointments` collection — customer/inspector relations, scheduledAt, timeSlot, propertyAddress, notes, status, link to inspection; role-scoped rules; indexes. |

Hostinger PocketBase will execute these automatically on startup (in timestamp order).

### Frontend — rewritten 🟢 KEEP

| File | Change |
|---|---|
| `apps/web/src/contexts/AuthContext.jsx` | Removed mock JWT + `localStorage.users`. Now uses `pb.collection('users').authWithPassword` / `create` / `authRefresh` / `requestPasswordReset`. Reactive to `pb.authStore.onChange`. |
| `apps/web/src/hooks/useInspectionStatus.js` | All CRUD via PocketBase. New helpers: `saveInspection`, `softDeleteInspection`, `restoreInspection`, `permanentlyDeleteInspection`, `getInspectionsForInspector`, `getDeletedInspections`. |
| `apps/web/src/components/InspectionForm.jsx` | Submits to PB; uses `inspector` relation field instead of `inspectorId` string; loading state on submit. |
| `apps/web/src/components/AdminApprovalActions.jsx` | Awaits async status update. |
| `apps/web/src/components/AdminInspectionDetailModal.jsx` | Inline metadata edit saves via `pb.collection('inspections').update`. |
| `apps/web/src/components/DeletedReportsArchive.jsx` | Lists / restores / permanently deletes through PB hook helpers. |
| `apps/web/src/pages/AdminDashboard.jsx` | Async data load + soft delete via PB. |
| `apps/web/src/pages/InspectorDashboard.jsx` | Loads inspector's own inspections from PB. |
| `apps/web/src/pages/InspectionViewPage.jsx` | Fetches inspection by ID from PB. |
| `apps/web/src/pages/AppointmentBookingPage.jsx` | Real inspectors loaded from `users` collection; booking persisted to `appointments` collection (real ISO timestamp). |
| `apps/web/src/pages/CustomerDashboard.jsx` | Real upcoming appointments + past inspections from PB (removed hardcoded `'4509 Elm Street'` mocks). |
| `apps/web/src/pages/LoginPage.jsx` | Awaits async login; functional "Forgot password?"; **demo credentials box removed**. |
| `apps/web/src/pages/CustomerSignupPage.jsx` | Awaits async signup. |

PB URL in `apps/web/src/lib/pocketbaseClient.js` remains `/hcgi/platform` — works natively on Hostinger.

### Local-dev additions 🔴 LOCAL ONLY — revert/exclude before Hostinger upload

| Path / Change | What it is | Action before upload |
|---|---|---|
| `apps/pocketbase/pocketbase.exe` (~32 MB) | Windows PocketBase v0.38.0 binary, downloaded so PB can run on this machine. | **Delete.** Hostinger uses the Linux `pocketbase` binary already in the repo. |
| `apps/pocketbase/pb_data/` (fresh local DB) | Wiped (`data.db*`, `auxiliary.db*`, `.notify/`) for a clean local start. | **Do not upload your local `pb_data/`.** Hostinger has its own encrypted `pb_data` that requires the original `PB_ENCRYPTION_KEY`. |

### Local-dev additions 🟡 OPTIONAL — works on both, revert if you want pristine config

| Path / Change | What it is | Action |
|---|---|---|
| `apps/web/vite.config.js` — added `server.proxy` block | Local dev only: proxies `/hcgi/platform/*` → `http://127.0.0.1:8090/*` so the same client URL works locally. Hostinger uses the production build (`vite build`), where Vite proxies are never active. | Safe to keep. If you want the original file back, delete the proxy block — see "Revert procedure" below. |

### Audited (no change needed) 🟢 KEEP

| File | Verdict |
|---|---|
| `apps/pocketbase/pb_migrations/1764579159_create_superuser.js` | Already safe — uses `$os.getenv("PB_SUPERUSER_EMAIL")` / `PB_SUPERUSER_PASSWORD`. No hardcoded credentials. |
| `apps/pocketbase/package.json` scripts | Still use `./pocketbase` (Linux path) — Hostinger-compatible. Not changed. |

---

## Revert procedure — before uploading to Hostinger

Run these from the workspace root:

```powershell
# 1. Delete Windows PocketBase binary
Remove-Item apps\pocketbase\pocketbase.exe -ErrorAction SilentlyContinue

# 2. Exclude local pb_data from upload (DO NOT delete if you want to keep local test data)
#    Just make sure you don't zip/upload it. Hostinger has its own pb_data.

# 3. (Optional) Restore the original vite.config.js by removing the local proxy block.
#    Open apps/web/vite.config.js and delete the entire `proxy: { '/hcgi/platform': {...} }` block.
```

Confirm Hostinger has these env vars set:
- `PB_SUPERUSER_EMAIL`
- `PB_SUPERUSER_PASSWORD`
- `PB_ENCRYPTION_KEY` (must match the one used to encrypt the existing Hostinger `pb_data`)

After upload, PocketBase on Hostinger will:
1. Decrypt `pb_data` using `PB_ENCRYPTION_KEY`.
2. Run the three new migrations (1779500000, …001, …002) in order.
3. Serve at `/hcgi/platform` — frontend continues to work with no client-side changes.

---

## Restore procedure — to run locally again on this machine

If you've already reverted the local-only items and want to start the local dev loop again:

```powershell
# 1. Download Windows PocketBase binary (v0.38.0, matches apps/pocketbase/.pocketbase-version)
$ver = "0.38.0"
$url = "https://github.com/pocketbase/pocketbase/releases/download/v$ver/pocketbase_${ver}_windows_amd64.zip"
Invoke-WebRequest -Uri $url -OutFile apps\pocketbase\pb_win.zip
Expand-Archive -Path apps\pocketbase\pb_win.zip -DestinationPath apps\pocketbase\_win -Force
Move-Item -Force apps\pocketbase\_win\pocketbase.exe apps\pocketbase\pocketbase.exe
Remove-Item -Recurse -Force apps\pocketbase\_win
Remove-Item apps\pocketbase\pb_win.zip

# 2. Restore the vite proxy block in apps/web/vite.config.js (only if you removed it):
#    Inside `server: { ... }`, add:
#
#    proxy: {
#      '/hcgi/platform': {
#        target: process.env.VITE_PB_URL || 'http://127.0.0.1:8090',
#        changeOrigin: true,
#        ws: true,
#        rewrite: (path) => path.replace(/^\/hcgi\/platform/, ''),
#      },
#    },

# 3. Start PocketBase (terminal 1)
cd apps\pocketbase
$env:PB_SUPERUSER_EMAIL="admin@inspectpro.local"
$env:PB_SUPERUSER_PASSWORD="ChangeMe!2026"
.\pocketbase.exe serve --http=127.0.0.1:8090 --hooksWatch=false

# 4. Start web (terminal 2)
cd apps\web
npm run dev
```

Local URLs:
- Web: http://localhost:3000/
- PB admin: http://127.0.0.1:8090/_/  (login: admin@inspectpro.local / ChangeMe!2026)

---

## Change template — copy below this line for future entries

```
## YYYY-MM-DD — Short title

### Backend 🟢/🟡/🔴
- file — what changed and why

### Frontend 🟢/🟡/🔴
- file — what changed and why

### Local-only 🔴
- thing — how to revert
```


---

## 2026-05-22 (cont.) — Production-readiness sweep (NYLA spec §1-8) 🟢 KEEP

Closed the 12 gap items from the spec audit. Every change below is portable to Hostinger; no host-specific code.

### Auth & session

| File | Change |
|---|---|
| `apps/web/src/contexts/AuthContext.jsx` | Added 30-minute idle-logout (spec §1). `lastActivityRef` is bumped by `mousemove/keydown/touchstart/scroll/click`; 10 s ticker raises `idleWarning` at 29 min and force-logs-out at 30 min. `extendSession()` resets the ref. JWT-exp warning path kept intact. |
| `apps/web/src/components/ProtectedRoute.jsx` | Suppresses browser **Back** navigation while authenticated by pushing a sentinel history entry and re-pushing on `popstate`. Idle-warning modal copy reworded to "Are you still there?". |

### Inspection workflow (5 phases, spec §2-5)

| File | Change |
|---|---|
| `apps/web/src/components/InspectionForm.jsx` | **Full rewrite.** Phases 2 & 3 were missing — now present. Phase 2 holds `areaCalculations` with `{length, width, lengthUnit, widthUnit}` and a `UNIT_FACTOR_TO_FEET` map for adaptive units (ft/in/m/cm); `totalSft` `useMemo` shows live area in sft. Phase 3 holds `waterQuality.{tds,pH}` plus a `BRAND_CATALOG` of switchboards/plumbing/appliances/tiles/paints toggle-pills with custom brand input. Phase 4 lists rooms with a `cornerPhotos` count badge and an amber "Phase A required" badge when ambient photos are zero. Phase 5 review shows total sft, brand count and defect total. Submit blocks when any room has defects but no ambient photos. |
| `apps/web/src/components/RoomPhotoManager.jsx` | **Full rewrite (BREAKING).** New defect schema `{id, title, description, severity, beforePhoto:{url}, afterPhoto:{url}}`. Phase B (defects) is locked until at least one Phase A corner/ambient photo exists (`phaseBLocked = cornerPhotos.length === 0` → `fieldset disabled` + amber Lock banner). All `<input type="file">` use `capture="environment"` so phones open the rear camera. Severity tier dots are coloured by `DEFAULT_SEVERITIES` (Major red / Minor orange / Cosmetic yellow). Save validates each defect has before + after + severity. **Note:** existing seeded defects use the old `{photos:[]}` shape — they still render in PDF, but editing them in this new UI starts a fresh defect record. |

### Settings & whitelabel

| File | Change |
|---|---|
| `apps/web/src/contexts/SettingsContext.jsx` | Enriched defaults: `commentLibrary` now has Kitchen/Bathroom/Master Bedroom/Living Room/General presets; `severityLevels` defaults to the 3-tier scheme with names + definitions + colors. (Storage stays in `localStorage` — single-admin scope; reactive `useSettings()` cascade is unchanged.) |
| `apps/web/src/pages/AdminSettingsPage.jsx` | Replaced placeholder *Comments* and *Severity* tabs with real CRUD UIs: per-room-class select + add-preset input + per-item delete; severity rows with color picker + name + definition + add/remove. |

### Report (deterministic page order, spec §6)

| File | Change |
|---|---|
| `apps/web/src/utils/ReportGenerator.jsx` | **Full rewrite.** Page order is now exactly: Cover → Disclaimer 1 → Disclaimer 2 → Severity Taxonomy → Area Calculations (per-row unit columns + total sft) → Water Quality + Brands → Rooms (Phase A gallery + Phase B before/after cards with severity-coloured left border) → Sign-off (signatures + doc hash). Backwards-compatible: legacy `defect.photos[]` still renders. |

### Chat (auto-thread + 5-axis omni-search, spec §7)

| File | Change |
|---|---|
| `apps/pocketbase/pb_migrations/1779500003_fix_chats_participants_multi.js` | New migration. Bumps `chats.participants.maxSelect` from **1 → 10** and `minSelect` to 1, unblocking multi-party group chats. **Verified applied** (live PB returns `maxSelect: 10`). |
| `apps/web/src/hooks/useInspectionStatus.js` | On every new inspection, `saveInspection` now auto-creates a group chat — fetches all admin user IDs (`role="admin"`), builds `participants = [...admins, inspectorId, customerId]`, then `pb.collection('chats').create({type:'group', participants, inspectionId})`. Wrapped in `try/catch` — failure logs a warn and does not block the inspection save. |
| `apps/web/src/pages/ChatPage.jsx` | **Full rewrite.** New 5-axis omni-search in a `Popover` filter panel: (1) content keywords, (2) sender name, (3) date range from/to, (4) inspection ID substring, (5) attachment type (any / with / none / image / pdf via `matchAttachment` helper inspecting `msg.attachments[].type|name`). `evaluateMessage()` runs all axes; `filteredChats` and `visibleMessages` memos drive both the sidebar list and the open-thread feed. `activeFilterCount` badge on the Filter button; banner above messages shows "X of Y messages" with a Clear button. Right-sidebar shows the inspection ID for group chats. |

### Definition-of-Done checklist (spec §8)

| # | Item | Status |
|---|---|---|
| 1 | 30-min inactivity → auto-logout + 29-min warning | ✅ |
| 2 | Phase A photos required before Phase B defects | ✅ |
| 3 | Before/After paired photos + 3-tier severity colours | ✅ |
| 4 | Adaptive unit picker (ft/in/m/cm) with sft normalization | ✅ |
| 5 | `capture="environment"` on all photo inputs | ✅ |
| 6 | Admin comment dictionary + room-class autocomplete | ✅ |
| 7 | Whitelabel live cascade (reactive `useSettings()`) | ✅ |
| 8 | Deterministic PDF page order matching spec §6 | ✅ |
| 9 | Browser back-button suppression while authenticated | ✅ |
| 10 | Auto chat thread on inspection create | ✅ (needs migration 1779500003) |
| 11 | 5-axis omni-search in chat | ✅ |
| 12 | CHANGELOG updated | ✅ (this entry) |

### Known caveat

`SettingsContext` remains `localStorage`-backed (per-admin-session). Cross-device sync would need a PB-backed `settings` collection — deferred. Within a single browser session, every consumer of `useSettings()` re-renders on change, which satisfies the spec's "live cascade" DoD for the admin user editing settings.



---

## 2026-05-22 (cont.) — Production-readiness sweep (NYLA spec §1-8) 🟢 KEEP

Closed the 12 gap items from the spec audit. Every change below is portable to Hostinger; no host-specific code.

### Auth & session

| File | Change |
|---|---|
| `apps/web/src/contexts/AuthContext.jsx` | Added 30-minute idle-logout (spec §1). `lastActivityRef` is bumped by `mousemove/keydown/touchstart/scroll/click`; 10 s ticker raises `idleWarning` at 29 min and force-logs-out at 30 min. `extendSession()` resets the ref. JWT-exp warning path kept intact. |
| `apps/web/src/components/ProtectedRoute.jsx` | Suppresses browser **Back** navigation while authenticated by pushing a sentinel history entry and re-pushing on `popstate`. Idle-warning modal copy reworded to "Are you still there?". |

### Inspection workflow (5 phases, spec §2-5)

| File | Change |
|---|---|
| `apps/web/src/components/InspectionForm.jsx` | **Full rewrite.** Phases 2 and 3 were missing — now present. Phase 2 holds `areaCalculations` with `{length, width, lengthUnit, widthUnit}` and a `UNIT_FACTOR_TO_FEET` map for adaptive units (ft/in/m/cm); `totalSft` `useMemo` shows live area in sft. Phase 3 holds `waterQuality.{tds,pH}` plus a `BRAND_CATALOG` of switchboards/plumbing/appliances/tiles/paints toggle-pills with custom brand input. Phase 4 lists rooms with a `cornerPhotos` count badge and an amber "Phase A required" badge when ambient photos are zero. Phase 5 review shows total sft, brand count and defect total. Submit blocks when any room has defects but no ambient photos. |
| `apps/web/src/components/RoomPhotoManager.jsx` | **Full rewrite (BREAKING).** New defect schema `{id, title, description, severity, beforePhoto:{url}, afterPhoto:{url}}`. Phase B (defects) is locked until at least one Phase A corner/ambient photo exists. All `<input type="file">` use `capture="environment"`. Severity tier dots are coloured by `DEFAULT_SEVERITIES` (Major red / Minor orange / Cosmetic yellow). Save validates each defect has before + after + severity. **Note:** existing seeded defects use the old `{photos:[]}` shape — they still render in PDF, but editing them in this new UI starts a fresh defect record. |

### Settings and whitelabel

| File | Change |
|---|---|
| `apps/web/src/contexts/SettingsContext.jsx` | Enriched defaults: `commentLibrary` now has Kitchen/Bathroom/Master Bedroom/Living Room/General presets; `severityLevels` defaults to the 3-tier scheme with names + definitions + colors. (Storage stays in `localStorage` — single-admin scope; reactive `useSettings()` cascade is unchanged.) |
| `apps/web/src/pages/AdminSettingsPage.jsx` | Replaced placeholder Comments and Severity tabs with real CRUD UIs: per-room-class select + add-preset input + per-item delete; severity rows with color picker + name + definition + add/remove. |

### Report (deterministic page order, spec §6)

| File | Change |
|---|---|
| `apps/web/src/utils/ReportGenerator.jsx` | **Full rewrite.** Page order is now exactly: Cover → Disclaimer 1 → Disclaimer 2 → Severity Taxonomy → Area Calculations → Water Quality + Brands → Rooms (Phase A gallery + Phase B before/after cards with severity-coloured left border) → Sign-off. Backwards-compatible: legacy `defect.photos[]` still renders. |

### Chat (auto-thread + 5-axis omni-search, spec §7)

| File | Change |
|---|---|
| `apps/pocketbase/pb_migrations/1779500003_fix_chats_participants_multi.js` | New migration. Bumps `chats.participants.maxSelect` from **1 to 10** and `minSelect` to 1, unblocking multi-party group chats. **Verified applied** (live PB returns `maxSelect: 10`). |
| `apps/web/src/hooks/useInspectionStatus.js` | On every new inspection, `saveInspection` now auto-creates a group chat — fetches all admin user IDs (`role="admin"`), builds `participants = [...admins, inspectorId, customerId]`, then `pb.collection('chats').create({type:'group', participants, inspectionId})`. Wrapped in `try/catch` — failure logs a warn and does not block the inspection save. |
| `apps/web/src/pages/ChatPage.jsx` | **Full rewrite.** New 5-axis omni-search in a `Popover` filter panel: (1) content keywords, (2) sender name, (3) date range from/to, (4) inspection ID substring, (5) attachment type. `evaluateMessage()` runs all axes; `filteredChats` and `visibleMessages` memos drive both the sidebar list and the open-thread feed. `activeFilterCount` badge on the Filter button; banner above messages shows "X of Y messages" with a Clear button. |

### Definition-of-Done checklist (spec §8)

| # | Item | Status |
|---|---|---|
| 1 | 30-min inactivity → auto-logout + 29-min warning | done |
| 2 | Phase A photos required before Phase B defects | done |
| 3 | Before/After paired photos + 3-tier severity colours | done |
| 4 | Adaptive unit picker (ft/in/m/cm) with sft normalization | done |
| 5 | `capture="environment"` on all photo inputs | done |
| 6 | Admin comment dictionary + room-class autocomplete | done |
| 7 | Whitelabel live cascade (reactive `useSettings()`) | done |
| 8 | Deterministic PDF page order matching spec §6 | done |
| 9 | Browser back-button suppression while authenticated | done |
| 10 | Auto chat thread on inspection create | done (needs migration 1779500003) |
| 11 | 5-axis omni-search in chat | done |
| 12 | CHANGELOG updated | done (this entry) |

### Known caveat

`SettingsContext` remains `localStorage`-backed (per-admin-session). Cross-device sync would need a PB-backed `settings` collection — deferred. Within a single browser session, every consumer of `useSettings()` re-renders on change, which satisfies the spec's "live cascade" DoD for the admin user editing settings.


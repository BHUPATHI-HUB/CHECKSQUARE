# RUN ON A NEW SYSTEM — CheckSquare

Complete steps to get CheckSquare running on a fresh machine. Reflects the
**current** architecture: React frontend + **Supabase cloud** backend
(Postgres + Auth + Storage), offline-first capture, and an optional Android APK.

> PocketBase is **retired** — it is no longer the backend. Ignore the old
> PocketBase-based setup docs; use this file.

---

## 1. Architecture at a glance

```
Browser / Android app  ──HTTPS──►  Supabase CLOUD
(React, served by Vite            ├─ Postgres  (data)
 or bundled in the APK)           ├─ Auth      (login / roles)
 + IndexedDB offline cache        └─ Storage   (inspection photos)
```

- **Frontend**: static React app (Vite). Runs from a local dev server, any static host, or bundled inside the Android APK.
- **Backend**: Supabase project `jcnvcyocatcovtdedokf` (region: Tokyo). Nothing to run locally for the backend.
- **Offline-first**: the app keeps in-progress inspections + photos in IndexedDB and syncs to Supabase when back online.

---

## 2. Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | ≥ 20 | web app |
| npm | ≥ 10 | installing deps |
| Git | any | clone/push |
| JDK | **21** | Android APK only (Capacitor 8 requires 21) |
| Android SDK | current | Android APK only (`ANDROID_HOME` set) |

---

## 3. Web app — run locally

```powershell
git clone https://github.com/BHUPATHI-HUB/CHECKSQUARE.git
cd CHECKSQUARE
npm install                      # root (npm workspaces installs apps/web)
```

### 3.1 Environment file (required)

`apps/web/.env.local` is **gitignored**, so create it on each new machine:

```
VITE_PB_URL=http://127.0.0.1:8090
VITE_SUPABASE_URL=https://jcnvcyocatcovtdedokf.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjbnZjeW9jYXRjb3Z0ZGVkb2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNjA3MDQsImV4cCI6MjA5ODczNjcwNH0.sDQgR5LfABkaXHkjdNKm42T3gDqHRnb_WPRXjy0PyIo
VITE_USE_SUPABASE_AUTH=true
VITE_USE_SUPABASE_DB=true
```

> The anon key is public (it ships in the browser bundle) — safe to keep here.
> The **service-role** key is NOT needed to run the app; never commit it.

### 3.2 Start the dev server

```powershell
cd apps\web
npm run dev
```

Open **http://127.0.0.1:3000/** (or :3001 if 3000 is busy). Use `127.0.0.1`
rather than `localhost` if the browser hangs (an IPv6 quirk on some networks).

### 3.3 Production build

```powershell
cd apps\web
npx vite build --outDir ../../dist/apps/web
```

Output goes to `dist/apps/web` (used by the Android APK).

---

## 4. Backend (Supabase) — already provisioned

The cloud project is live; normally you do **nothing** here. Only needed when
recreating the backend from scratch (new project):

1. Supabase Dashboard → SQL Editor → run [supabase/cloud_apply.sql](supabase/cloud_apply.sql)
   (creates schema, RLS, triggers, and the `inspection-photos` + `reports` buckets).
2. If you ever see `stack depth limit exceeded` on `profiles`, run
   [supabase/fix_rls_recursion.sql](supabase/fix_rls_recursion.sql).
3. Update `.env.local` with the new project's URL + anon key.

**If the project is "Paused/Unhealthy"** (free tier sleeps): open the Supabase
dashboard → project → **Restore/Restart**, wait for green, then retry.

---

## 5. Test login credentials

(Existing accounts; change these before real use.)

| Role | Email | Password |
|---|---|---|
| Admin | `admin.test@checksquare.dev` | `CheckAdmin@2026` |
| Inspector | `inspector.test@checksquare.dev` | `CheckInspector@2026` |
| Customer | `customer.test@checksquare.dev` | `CheckCustomer@2026` |

Migrated users have random passwords — set new ones via Supabase Dashboard →
Authentication → Users, or the app's "Forgot password".

---

## 6. Android APK (offline-capable)

The APK **bundles** the web build (no remote URL), so it runs the current code
offline on-device.

```powershell
# 1. Build the web app first (section 3.3)
cd apps\web
npx vite build --outDir ../../dist/apps/web

# 2. Copy web assets + plugins into the Android project
node ".\node_modules\@capacitor\cli\bin\capacitor" sync android

# 3. Build the APK  (MUST use JDK 21; force IPv4 on restrictive networks)
cd android
$env:JAVA_HOME="C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
.\gradlew.bat assembleDebug --no-daemon `
  "-Dorg.gradle.java.installations.paths=$env:JAVA_HOME" `
  "-Djava.net.preferIPv4Stack=true" `
  "-Dhttps.protocols=TLSv1.2,TLSv1.3"
```

- **Output:** `apps/web/android/app/build/outputs/apk/debug/app-debug.apk`
- Install: copy to the phone and tap it (enable "install unknown apps"), or `adb install app-debug.apk`.

### Android gotchas
- **JDK 21 is required** (Capacitor 8). If `JAVA_HOME` points to JDK 17 you get
  `Cannot find a Java installation matching languageVersion=21`.
- **`-Djava.net.preferIPv4Stack=true`** works around `dl.google.com`
  "Remote host terminated the handshake" TLS errors on some networks.
- To make the APK auto-load a hosted site instead of bundling, re-add
  `server.url` to [apps/web/capacitor.config.json](apps/web/capacitor.config.json)
  (this disables offline).

---

## 7. Maintenance scripts (optional)

Run from the repo root. These reach Supabase; on IPv6-restricted networks prefix
with `node --dns-result-order=ipv4first`.

- **Shrink/relocate embedded photos** (moves base64-in-JSON photos to Storage,
  resized). Dry-run by default:
  ```powershell
  node --dns-result-order=ipv4first scripts/shrink-existing-photos.mjs            # preview
  node --dns-result-order=ipv4first scripts/shrink-existing-photos.mjs --commit   # apply
  ```

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Browser hangs on `localhost:3000` | Use `http://127.0.0.1:3000/` (IPv6 quirk) |
| API returns `503 PGRST002` | Supabase project paused — Restore it in the dashboard |
| `stack depth limit exceeded` on profiles | Run `supabase/fix_rls_recursion.sql` |
| Node script `fetch failed` / timeout | Add `--dns-result-order=ipv4first` |
| Gradle `languageVersion=21` not found | Set `JAVA_HOME` to JDK 21 |
| Gradle `handshake terminated` (dl.google.com) | Add `-Djava.net.preferIPv4Stack=true` |
| New photos not uploading | They queue offline; a "waiting to sync" badge appears and uploads when online |

---

## 9. Where things live

| Concern | File |
|---|---|
| Data/auth/storage access layer | [apps/web/src/services/dataService.js](apps/web/src/services/dataService.js) |
| Auth (Supabase) | [apps/web/src/contexts/AuthContext.jsx](apps/web/src/contexts/AuthContext.jsx) |
| Photo upload/resolve (local-first) | [apps/web/src/lib/supabasePhotoStorage.js](apps/web/src/lib/supabasePhotoStorage.js) |
| Offline store (IndexedDB) | [apps/web/src/lib/localStore.js](apps/web/src/lib/localStore.js) |
| Offline sync engine | [apps/web/src/services/syncEngine.js](apps/web/src/services/syncEngine.js) |
| Report generation (PDF/DOCX) | [apps/web/src/utils/ReportGenerator.jsx](apps/web/src/utils/ReportGenerator.jsx) |
| Excel export | [apps/web/src/utils/ExcelReportGenerator.js](apps/web/src/utils/ExcelReportGenerator.js) |
| Admin settings (incl. Report Images) | [apps/web/src/pages/AdminSettingsPage.jsx](apps/web/src/pages/AdminSettingsPage.jsx) |
| Supabase schema | [supabase/cloud_apply.sql](supabase/cloud_apply.sql) |

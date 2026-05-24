# RUNPROJECT.md — How to run the project (local + Cloudflare)

Quick reference for starting the app on any laptop after pulling the latest code.
All commands run from the **project root** in PowerShell.

---

## 0. After pulling new changes from another laptop

```powershell
git pull
npm install            # only needed if package.json changed
```

---

## 1. Run LOCAL ONLY (this laptop only)

Open **two** terminals.

### Terminal A — backend (PocketBase)
```powershell
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090
```
Wait for: `Server started at http://127.0.0.1:8090`

### Terminal B — frontend (Vite)
```powershell
cd apps\web
npm run dev
```
Wait for: `Local:   http://localhost:3000/`

### Open in browser
| URL | What |
|---|---|
| http://localhost:3000 | React app (login here) |
| http://127.0.0.1:8090/_/ | PocketBase admin UI |

**Superuser:** `bhupathimani33@gmail.com` / `mandy@1234`

Stop with `Ctrl+C` in each terminal.

---

## 2. Run with CLOUDFLARE (public access)

Architecture: backend stays on your laptop, exposed via Cloudflare Tunnel; frontend is hosted free on Cloudflare Pages.

Open **two** terminals (frontend is hosted on Pages, no local Vite needed for the public site).

### Terminal A — backend
```powershell
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090
```

### Terminal B — Cloudflare Tunnel
```powershell
cloudflared tunnel --url http://127.0.0.1:8090
```

The tunnel prints a public URL like:
```
https://brass-either-electoral-halifax.trycloudflare.com
```
**Copy this URL — it changes every restart.**

### Smoke test
```powershell
Invoke-WebRequest "https://<your-tunnel>.trycloudflare.com/api/health" -UseBasicParsing
# expect StatusCode 200
```

### Shortcut: one-command start
```powershell
.\start-tunnel.ps1
```
Launches PocketBase + tunnel in two windows. **Don't run if PB is already on 8090.**

---

## 3. Every time the tunnel URL changes

Do these **two** steps in the browser:

### A. Update Cloudflare Pages env var
1. https://dash.cloudflare.com → **Workers & Pages** → your project (`checksquare`)
2. **Settings → Environment Variables** → edit `VITE_PB_URL` → paste new tunnel URL (no trailing slash) → **Save**
3. **Deployments → Retry deployment** (or push any commit to trigger a build)

### B. Update PocketBase Application URL (CORS)
1. Open http://127.0.0.1:8090/_/ → log in as superuser
2. **Settings → Application → Application URL** → paste your Pages URL, e.g. `https://checksquare.pages.dev`
3. **Save**

Without step B, login on the live site fails silently with a CORS error.

---

## 4. First-time Cloudflare Pages setup (one-time only)

Only needed once per Cloudflare account. Skip if already set up.

1. Push latest code: `git add . ; git commit -m "deploy" ; git push`
2. https://dash.cloudflare.com → **Workers & Pages** → **Create application** → **Pages** tab (NOT Workers)
3. **Connect to Git** → authorize GitHub → pick repo → branch `main`
4. Fill in **exactly**:

   | Field | Value |
   |---|---|
   | Framework preset | **None** |
   | Build command | `npm install && npm run build --workspace apps/web` |
   | **Build output directory** | **`dist/apps/web`** |
   | Root directory | *(blank)* |

5. **Environment variables** → add:

   | Name | Value |
   |---|---|
   | `VITE_PB_URL` | your tunnel URL (no trailing slash) |
   | `NODE_VERSION` | `20` |

6. **Save and Deploy** → wait ~2 min → copy `https://<project>.pages.dev`
7. Do step **3.B** above to fix CORS.

---

## 5. Reset / create superuser

If you forget the superuser password (no recovery — must reset via CLI):
```powershell
cd apps\pocketbase
.\pocketbase.exe superuser upsert your-email@example.com "YourPassword"
```
- `upsert` adds-or-updates
- Keep **quotes** around the password (special chars like `!` break without them)
- Min 10 characters

---

## 6. Important reminders

- ❌ **Never delete** `apps\pocketbase\pb_data\` — contains the DB + uploaded photos
- ❌ **Never run two PocketBase instances** against the same `pb_data` folder (corrupts SQLite)
- ❌ **Never commit** `pb_data/`, `backups/`, or `pb_backup_*.zip` (`.gitignore` already excludes them)
- ⚠️ Laptop must stay **on + awake** for the public site to work
  - Power → Sleep → **Never** while plugged in
- ⚠️ Quick Tunnel URL **changes on every `cloudflared` restart** → update `VITE_PB_URL` + redeploy
- 💾 To move data to another laptop, see [BACKUP.md](BACKUP.md) (`backup-pb.ps1` / `restore-pb.ps1`)

---

## 7. Troubleshooting quick table

| Symptom | Fix |
|---|---|
| `Port 8090 already in use` | PB already running. Find it: `Get-Process pocketbase` |
| `Port 3000 already in use` | `cd apps\web ; npm run dev -- --port 3001` |
| `cloudflared : not recognized` | Close + reopen PowerShell (PATH wasn't refreshed after install) |
| Login on Pages site fails silently | CORS — do step **3.B** |
| Pages site shows blank page | Output dir wrong — must be `dist/apps/web` exactly |
| 403 on every API call | User's `role` field isn't `admin` — fix in PB admin |

---

End. Keep this file open in a second window when starting the project.

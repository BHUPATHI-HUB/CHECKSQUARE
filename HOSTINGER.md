# HOSTINGER.md — Deploy to Hostinger Horizons

> **Use this guide if:** your project is already on Hostinger Horizons
> (the AI builder platform — the URL where you originally exported the
> project from). It hosts both the React frontend AND PocketBase backend
> in one place, with the `/hcgi/platform` reverse proxy already wired up.
>
> **If you're on Hostinger VPS or shared Web Hosting instead:** the
> playbook is different. Ask the agent for that variant.

---

## TL;DR

| Step | Action |
|---|---|
| 1 | Clean local-only files (`pocketbase.exe`, `pb_data/`) — `.gitignore` already handles it |
| 2 | `git push` to GitHub |
| 3 | In Hostinger Horizons project: **Pull from Git** OR drag-and-drop the project zip |
| 4 | Set 3 env vars: `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD`, `PB_ENCRYPTION_KEY` |
| 5 | Click **Deploy** — Hostinger runs `npm install`, `npm run build`, and starts PocketBase |
| 6 | Open your Hostinger `*.horizonshosting.com` URL — log in with your superuser |
| 7 | (Optional) Restore your local backup zip into the live Hostinger PocketBase |

---

## Why Horizons "just works"

Your frontend code calls PocketBase at `/hcgi/platform` (see
[apps/web/src/lib/pocketbaseClient.js](apps/web/src/lib/pocketbaseClient.js#L10)).

- **Local dev**: Vite proxies `/hcgi/platform/*` → `http://127.0.0.1:8090`
  (see [apps/web/vite.config.js](apps/web/vite.config.js)).
- **Hostinger Horizons**: their managed reverse proxy maps `/hcgi/platform/*`
  → their managed PocketBase instance (port internal, not exposed).

Same code path, two environments. **No `VITE_PB_URL` changes needed.**

---

## Step 1 — Clean local-only files before uploading

These should never go to Hostinger:

| File | Why exclude |
|---|---|
| `apps/pocketbase/pocketbase.exe` | Windows binary; Hostinger uses Linux |
| `apps/pocketbase/pb_data/` | Your local DB; Hostinger has its own (encrypted) |
| `backups/` / `pb_backup_*.zip` | Contains hashed passwords + uploaded files |
| `node_modules/`, `dist/`, `.env*` | Built/secret stuff |

`.gitignore` already excludes all of these. **Verify before pushing:**

```powershell
git status --short                    # should show no pb_data / pocketbase.exe / backups
git ls-files | Select-String "pb_data|pocketbase.exe|backups"   # should be empty
```

If any of them appear, stop and add them to `.gitignore` first.

---

## Step 2 — Push the latest code to GitHub

```powershell
git add .
git commit -m "Ready for Hostinger Horizons deploy"
git push
```

Repo: <https://github.com/BHUPATHI-HUB/CHECKSQUARE>

---

## Step 3 — Get the code into Hostinger Horizons

You have two paths inside the Horizons dashboard:

### 3a — Pull from Git (recommended)

1. Open your Horizons project → **Settings → Source / Git integration**.
2. Connect the **BHUPATHI-HUB/CHECKSQUARE** repo, branch `main`.
3. Click **Pull latest**.

Horizons will mirror your repo into the managed file system.

### 3b — Upload a zip (fallback)

If Git integration isn't available on your plan:

```powershell
# From the repo root, create an upload zip with ONLY safe files:
git archive --format=zip --output=horizons-upload.zip HEAD
```

`git archive` only includes files tracked in Git — automatically excludes
`pb_data/`, `node_modules/`, `pocketbase.exe`, `backups/`, etc. Upload
`horizons-upload.zip` via Horizons → **Project → Import / Upload**.

---

## Step 4 — Set environment variables

In Horizons → **Project → Settings → Environment Variables**, add:

| Variable | Value | Notes |
|---|---|---|
| `PB_SUPERUSER_EMAIL` | your real email | First-time superuser created automatically |
| `PB_SUPERUSER_PASSWORD` | strong password (≥ 12 chars) | Min 8 required by PB |
| `PB_ENCRYPTION_KEY` | random 32-char string | **Must match the key used when the original pb_data was encrypted**, otherwise restore fails. New install? Generate one: see below. |

Generate a fresh encryption key (only for a brand-new install):
```powershell
-join ((1..32) | ForEach-Object { [char](Get-Random -Min 33 -Max 126) })
```
Save it somewhere safe — losing it makes encrypted fields unreadable forever.

Optional (only if you use the builder-mailer hook for email):

| Variable | Value |
|---|---|
| `BUILDER_MAILER_API_URL` | your transactional-email API URL |
| `BUILDER_MAILER_API_KEY` | your API key |
| `BUILDER_MAILER_SENDER_ADDRESS` | `noreply@yourdomain.com` |

---

## Step 5 — Deploy

Click **Deploy** in the Horizons dashboard. The platform will:

1. Run `npm install` (npm workspaces installs both `apps/web` and `apps/pocketbase`).
2. Run `npm run build --workspace apps/web` → outputs to `dist/apps/web/`.
3. Serve `dist/apps/web/` as the static frontend.
4. Start `pocketbase serve` behind the `/hcgi/platform` proxy with your env vars.
5. Auto-apply every migration in `apps/pocketbase/pb_migrations/` on first boot.

Watch the deploy logs. Look for:
```
Server started at http://127.0.0.1:8090
Vite build complete: dist/apps/web/index.html
```

---

## Step 6 — Smoke-test the live site

1. Open `https://<your-project>.horizonshosting.com`.
2. You should see the React app load (no blank page).
3. Open browser DevTools → **Network** tab → reload.
4. Confirm a request like `GET /hcgi/platform/api/health` returns **HTTP 200**.
5. Click **Login** → enter your `PB_SUPERUSER_EMAIL` + `PB_SUPERUSER_PASSWORD`.
6. Visit `/admin/dashboard` — should render without 404/403.

If login fails silently, see Troubleshooting below.

---

## Step 7 — (Optional) Restore your local data into Horizons

If you want your local users / inspections / photos on the live site:

**This only works if `PB_ENCRYPTION_KEY` on Horizons matches the one used
when your local backup was created.** Otherwise PB can read the schema but
not encrypted fields.

1. On your laptop, create a fresh backup:
   ```powershell
   .\backup-pb.ps1
   ```
2. In Hostinger Horizons → **Files / SFTP**, navigate to the PocketBase
   working directory (usually `apps/pocketbase/` or the path shown in the
   deploy logs).
3. Stop the PocketBase process from the Horizons dashboard.
4. Delete the existing `pb_data/` contents.
5. Upload the contents of your backup zip into `pb_data/`.
6. Restart PocketBase from the dashboard.
7. Log in with your **original** superuser credentials (the ones from your
   local DB, not the env-var ones — env-var superuser is only created if
   `pb_data` is empty on first boot).

---

## Files that exist FOR this deploy (don't delete)

| File | Purpose |
|---|---|
| [apps/pocketbase/package.json](apps/pocketbase/package.json) | `start` script: `./pocketbase serve ... --encryptionEnv=PB_ENCRYPTION_KEY --dir=/data ...` — Horizons / Fly.io compatible |
| [apps/pocketbase/pb_hooks/](apps/pocketbase/pb_hooks/) | Server-side hooks (builder-mailer, etc.) |
| [apps/pocketbase/pb_migrations/](apps/pocketbase/pb_migrations/) | Auto-applied on first start |
| [apps/web/src/lib/pocketbaseClient.js](apps/web/src/lib/pocketbaseClient.js) | Uses `/hcgi/platform` fallback — required for Horizons |

---

## Troubleshooting

### Login on live site spins forever / fails silently
- DevTools → Console → look for `CORS` or `401`.
- Most common cause: `PB_SUPERUSER_EMAIL` env var was set AFTER first boot;
  the superuser wasn't created. Fix: open Horizons SFTP, run
  `./pocketbase superuser upsert <email> "<password>"` from the deploy
  shell, then retry.

### Blank white page
- View page source. If you see `<script src="/src/main.jsx">`, the build
  step didn't run — check deploy logs for `npm run build` errors.
- If you see `<script src="/assets/index-<hash>.js">` and the file 404s,
  the static-file root is wrong; in Horizons → Settings → Build, set
  output directory to `dist/apps/web`.

### `/hcgi/platform/api/...` returns 502 / 503
- PocketBase process crashed. Check deploy logs.
- Common cause: `PB_ENCRYPTION_KEY` changed → PB can't decrypt existing
  data → exits. Restore the original key.

### Schema is correct but DB is empty after upload
- You uploaded `pb_data/` from a different environment that was encrypted
  with a different key. PB drops unreadable rows on boot. Either restore
  the matching key, or start fresh (delete `pb_data/`, let migrations
  re-create empty collections, re-create users).

### "Migrations applied" but no `users` collection visible
- The `pb_migrations/` folder didn't get uploaded. Check `git ls-files
  apps/pocketbase/pb_migrations/` locally — should list 12+ files. If
  missing, your `.gitignore` is too aggressive.

---

## Updating after the first deploy

```powershell
# Local
git add .
git commit -m "Feature: <thing>"
git push

# In Horizons dashboard: click "Pull latest" then "Deploy"
```

Migrations in `pb_migrations/` auto-apply on the next start — no manual
schema work needed.

---

## What NOT to do

- ❌ Don't upload `apps/pocketbase/pocketbase.exe` (Windows binary, won't run).
- ❌ Don't upload your local `pb_data/` unless you also know the encryption
  key it was created with.
- ❌ Don't commit `.env` or `.env.local` to Git — secrets belong in
  Horizons env vars only.
- ❌ Don't change `VITE_PB_URL` for Horizons — the `/hcgi/platform`
  default is what makes the proxy work.
- ❌ Don't enable both Horizons backend AND a Cloudflare Tunnel against
  the same DB folder — SQLite will corrupt.

---

See also: [SETUP.md](SETUP.md) · [DATABASE.md](DATABASE.md) ·
[BACKUP.md](BACKUP.md) · [DEPLOY-FREE.md](DEPLOY-FREE.md) (Cloudflare alt) ·
[DEPLOY.md](DEPLOY.md) (Fly.io alt).

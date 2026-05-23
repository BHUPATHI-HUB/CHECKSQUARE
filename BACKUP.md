# BACKUP.md — Keep the same database + users + photos across laptops

> **Why:** All your data — users, passwords, inspections, uploaded photos,
> app settings — lives in **one folder** (`apps/pocketbase/pb_data/`). That
> folder is in `.gitignore` (correctly — it contains secrets), so cloning
> the repo gives you an EMPTY app. To carry your real state to another
> laptop, you must transfer this folder.
>
> This guide gives you two scripts and three ways to do it.

---

## TL;DR

| Action | Command |
|---|---|
| Backup (source laptop) | `.\backup-pb.ps1` |
| Restore (new laptop)   | `.\restore-pb.ps1 -Source <path-to-zip>` |

Transfer the resulting `.zip` via USB / OneDrive / WhatsApp-to-yourself / email.
Done — same users, same passwords, same data, same photos.

---

## What's inside a backup

| Path | Purpose | Survives? |
|---|---|---|
| `pb_data\data.db` | SQLite DB — all users, inspections, settings | ✅ |
| `pb_data\data.db-shm` + `-wal` | SQLite working files | ✅ (auto-merged) |
| `pb_data\storage\` | Every uploaded photo, avatar, file | ✅ |
| `pb_data\logs.db` | Server logs | ✅ |
| `pb_data\types.d.ts` | PB-generated TypeScript hints | ✅ |
| `pocketbase.exe` | The binary | ❌ (the new `setup.ps1` re-downloads it) |
| `pb_migrations\` | Schema changes | ❌ (in git, comes with `git clone`) |
| `pb_hooks\` | Server-side JS hooks | ❌ (in git) |

Result: backup zip = **DB + uploads only**. Typically a few MB plus however
big your photos are.

---

## Full new-laptop flow — from zero to identical state

This is the end-to-end walkthrough for setting up the project on a **brand new** laptop with all your existing users, passwords, inspections, and photos.

### Step 1 — Transfer your backup zip
Copy `pb_backup_<timestamp>.zip` (e.g. 17 MB) to the new laptop via:
- OneDrive (sync folder), or
- USB drive, or
- email it to yourself, or
- WhatsApp / Telegram to yourself

### Step 2 — Install prerequisites on the new laptop
- Node.js 20 LTS — <https://nodejs.org>
- Git — <https://git-scm.com/download/win>

### Step 3 — Clone + base install
```powershell
cd $HOME
git clone https://github.com/BHUPATHI-HUB/CHECKSQUARE.git
cd CHECKSQUARE
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```
This downloads the PocketBase binary + runs `npm install`. Takes ~2 minutes.

### Step 4 — Restore your backup (replaces the empty `pb_data`)
```powershell
# IMPORTANT: PocketBase must NOT be running. The script will refuse otherwise.
.\restore-pb.ps1 -Source C:\Users\<you>\Downloads\pb_backup_<timestamp>.zip
```
You'll see:
```
Renaming existing pb_data → pb_data.replaced_<timestamp> (kept as safety net)
Restoring from: ...\pb_backup_<timestamp>.zip
✅ Restore complete. data.db = 0.4 MB
```

### Step 5 — Start the backend
```powershell
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090
```

### Step 6 — Verify (in a new terminal)
```powershell
# Should show same user count as your source laptop
Invoke-RestMethod "http://127.0.0.1:8090/api/collections/users/records?perPage=1" | Select-Object -ExpandProperty totalItems
```
Open <http://127.0.0.1:8090/_/> and log in with your **original superuser email + password**. All users, inspections, photos, settings are present.

### Step 7 — Start frontend (for local dev)
```powershell
# In a new terminal
cd apps\web
npm run dev
```
Open <http://localhost:3000> → log in with your same admin account.

### Step 8 — (Optional) Resume the public tunnel on the new laptop
Only if you want the new laptop to also host the live `*.pages.dev` site:
```powershell
winget install --id Cloudflare.cloudflared -e
# close + reopen PowerShell so cloudflared is on PATH
.\start-tunnel.ps1
# Copy the new *.trycloudflare.com URL it prints
# Cloudflare Pages → Settings → Environment Variables → update VITE_PB_URL → Save & Redeploy
# Then in PB admin → Settings → Application URL → keep https://checksquare.pages.dev
```

### Summary card (keep handy)

| Task | Command |
|---|---|
| Make backup | `.\backup-pb.ps1` |
| Move zip | OneDrive / USB / email |
| Clone + install | `git clone ...` → `setup.ps1` |
| Restore | `.\restore-pb.ps1 -Source <zip>` |
| Start backend | `cd apps\pocketbase ; .\pocketbase.exe serve --http=127.0.0.1:8090` |
| Verify | Log in with original email/password |
| Resume public tunnel | `.\start-tunnel.ps1` → update Pages env → redeploy |

### Common gotchas
- ❌ **Don't start PocketBase before running `restore-pb.ps1`** — the script refuses to overwrite a live DB.
- ❌ **Don't run two laptops against the same DB folder** (e.g. via OneDrive symlink) — SQLite will corrupt. Pick one "primary" laptop at a time.
- ✅ **Original `pb_data` is renamed, not deleted** — if restore goes wrong, `pb_data.replaced_<timestamp>` is your undo.
- ✅ **Same superuser credentials work** — passwords are stored hashed inside `data.db`, which is in the zip.

---

## Method 1 — Helper scripts (recommended)

### On the source laptop

```powershell
.\backup-pb.ps1
```

This:
1. Stops PocketBase (or asks you to use `-KeepRunning` if you must keep it up)
2. Zips `apps\pocketbase\pb_data\` to `backups\pb_backup_<timestamp>.zip`
3. Prints the path + size

Options:
```powershell
.\backup-pb.ps1 -Destination D:\my-backup.zip   # custom path
.\backup-pb.ps1 -KeepRunning                    # hot backup (don't stop PB)
```

### On the new laptop

```powershell
# 1. Clone + setup as usual
git clone https://github.com/BHUPATHI-HUB/CHECKSQUARE.git
cd CHECKSQUARE
powershell -ExecutionPolicy Bypass -File .\setup.ps1

# 2. Restore your backup
.\restore-pb.ps1 -Source C:\path\to\pb_backup_20260524_120000.zip

# 3. Start PocketBase
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090
```

Log in with the **same email + password** you used on the source laptop.
Every user, every photo, every inspection is identical.

### Safety net

`restore-pb.ps1` doesn't delete the existing `pb_data\` — it renames it to
`pb_data.replaced_<timestamp>\` first. If anything goes wrong, just rename
it back.

---

## Method 2 — Manual zip (no scripts)

### Source laptop
```powershell
# Stop PocketBase first (Ctrl+C in its terminal)
Compress-Archive -Path apps\pocketbase\pb_data -DestinationPath pb_backup.zip
```

### New laptop
```powershell
# After setup.ps1, with PocketBase NOT running:
Remove-Item -Recurse apps\pocketbase\pb_data
Expand-Archive -Path pb_backup.zip -DestinationPath apps\pocketbase\
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090
```

---

## Method 3 — PocketBase admin UI backup (no PowerShell needed)

PocketBase has a built-in backup feature.

### Source laptop
1. Open <http://127.0.0.1:8090/_/> → log in as superuser
2. **Settings** → **Backups** (sidebar)
3. **+ New backup** → name it `migration-may24` → **Create** → wait ~5 sec
4. Click the **⋯** next to the new entry → **Download** → saves a `.zip`

### New laptop
1. After `setup.ps1`, start a fresh PocketBase
2. Open <http://127.0.0.1:8090/_/> → create a **temporary** superuser
   (you'll throw this away — the restore brings the real one back)
3. **Settings** → **Backups** → **Upload backup** → pick the `.zip`
4. Click **⋯** on it → **Restore** → confirm
5. PocketBase restarts itself. Log in with your **original** credentials.

> ⚠️ The admin UI backup format and the helper-script zip format are NOT
> interchangeable. Use one method end-to-end.

---

## Method 4 — Run both laptops against ONE shared database

If you want to **actually use** the app from both laptops without re-syncing
each time, don't run two PocketBase instances. Instead:

1. Run PocketBase + `cloudflared` on **laptop A** (the "server")
2. On **laptop B**, don't run PocketBase at all
3. On laptop B's `apps/web/.env.local`, set:
   ```
   VITE_PB_URL=https://your-tunnel-url.trycloudflare.com
   ```
4. `cd apps\web ; npm run dev` on laptop B
5. Laptop B's local dev frontend now talks to laptop A's PocketBase

⚠️ Don't try to run PocketBase against the same `pb_data/` folder from both
laptops (e.g. via OneDrive sync). SQLite will corrupt.

---

## Automating recurring backups

### Option A — PocketBase auto-backup (in the admin UI)
1. <http://127.0.0.1:8090/_/> → Settings → Backups → **Auto backup**
2. Cron: `0 3 * * *` (3 AM daily)
3. Max keep: `7` (rotates after a week)
4. Save

Now PocketBase creates a daily backup automatically. Download/copy them via
the **⋯** menu when needed.

### Option B — Windows Task Scheduler + helper script
```powershell
# Create a daily task that runs backup-pb.ps1 at 3 AM
$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
            -Argument "-ExecutionPolicy Bypass -File C:\Users\$env:USERNAME\CHECKSQUARE\backup-pb.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 3am
Register-ScheduledTask -TaskName "CheckSquare PB Backup" -Action $action -Trigger $trigger
```

---

## What to back up + WHERE to keep the zips

| Where | Pros | Cons |
|---|---|---|
| OneDrive / Google Drive | Auto-synced, off-laptop | Free tier limited (15 GB) |
| External USB / SSD | Fast, large | Forget to plug in = no backup |
| Email to yourself | Free, always available | Slow for big files |
| Private GitHub repo (separate, not this one) | Versioned | Don't store the backup in THIS repo — `.gitignore` excludes pb_data on purpose |

**Recommendation:** OneDrive (`C:\Users\<you>\OneDrive\CheckSquare-backups\`).
Change `backup-pb.ps1` default destination to that path if you want auto-sync.

---

## Verifying a restore worked

After restoring on the new laptop:

```powershell
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090

# In another terminal:
Invoke-RestMethod "http://127.0.0.1:8090/api/collections/users/records?perPage=1" `
    | Select-Object -ExpandProperty totalItems
# Expected: same user count as on the source laptop
```

Also try logging into <http://localhost:3000> with your **original** email +
password. If it works → restore succeeded.

---

## Frequently asked

**Q: Can I commit `pb_data/` to the repo for "easy sync"?**
A: ❌ NO. It contains hashed passwords + private uploaded files. `.gitignore`
already blocks it for a reason.

**Q: How big does the backup get?**
A: DB itself is tiny (a few MB even with hundreds of users). Photos dominate
size — expect 1–5 MB per inspection if it has 10 photos. A site with 1000
inspections + photos could easily be 5–10 GB. Backups compress ~30–40 %.

**Q: I lost the source laptop. Can I recover?**
A: Only if you have a backup zip somewhere (OneDrive / USB / email).
Otherwise the data is gone — PocketBase doesn't sync anywhere by default.

**Q: Will the live Cloudflare Pages site keep working after I restore?**
A: Yes — but the backend has to be running + tunneled on whichever laptop is
"hosting" right now. If you move hosts, also re-run `.\start-tunnel.ps1` and
update `VITE_PB_URL` in Cloudflare Pages (see DEPLOY-FREE.md "Daily startup
routine").

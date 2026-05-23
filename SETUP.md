# InspectPro — Setup Guide

A complete, no-experience-needed walkthrough for getting this project running
on a brand-new Windows laptop after copying / unzipping the project folder.

> Looking for a one-click install? Run [setup.ps1](setup.ps1) in PowerShell —
> it does steps 1–4 for you automatically.

---

## What this project is

A two-part app:

| Part | Tech | Port |
|---|---|---|
| **Frontend (`apps/web`)** | React 18 + Vite + Tailwind + shadcn/ui | `http://localhost:3000` |
| **Backend (`apps/pocketbase`)** | PocketBase (single Go binary, embedded SQLite DB) | `http://127.0.0.1:8090` |

There is **no separate database server** — PocketBase keeps everything inside
`apps/pocketbase/pb_data/`. To migrate the whole app between computers, you
copy the project folder and that `pb_data/` folder.

---

## Step 1 — Install the prerequisites (one time only)

Install these three things on the new laptop. Click through the default
options.

1. **Node.js 20 LTS** → <https://nodejs.org/en/download>
2. **Git** → <https://git-scm.com/download/win>
3. **VS Code** → <https://code.visualstudio.com>

Verify they work — open **PowerShell** (Start → "PowerShell") and run:

```powershell
node -v    # should print v20.x.x
npm  -v    # should print 10.x.x or higher
git  --version
```

---

## Step 2 — Unzip / copy the project

1. Right-click your `.zip` → **Extract All…** → choose a short path like
   `C:\Projects\inspectpro`. Avoid `Downloads` / `OneDrive` (long paths break
   some Node tools).
2. Open VS Code → **File → Open Folder…** → pick that folder.

---

## Step 3 — Get the PocketBase binary

The project does **not** ship with `pocketbase.exe` (it's OS-specific). Grab
the matching version:

1. Open <https://github.com/pocketbase/pocketbase/releases>
2. Download **`pocketbase_0.26.x_windows_amd64.zip`** (the `0.26` line —
   matches the JS SDK we use).
3. Open the zip → copy **`pocketbase.exe`** into your project's
   `apps\pocketbase\` folder.

> macOS / Linux: download the matching build (`darwin_arm64` /
> `linux_amd64`), put the `pocketbase` binary in the same folder, then
> `chmod +x apps/pocketbase/pocketbase`.

---

## Step 4 — Install npm dependencies

Open a VS Code terminal (**Terminal → New Terminal**, at project root) and run:

```powershell
npm install
```

This pulls down everything for both `apps/web` and `apps/pocketbase` thanks
to the npm `workspaces` field in [package.json](package.json). Takes 1–3
minutes the first time.

---

## Step 5 — Start the backend

Still in the VS Code terminal:

```powershell
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090
```

You should see:

```
Server started at http://127.0.0.1:8090
├─ REST API:  http://127.0.0.1:8090/api/
└─ Dashboard: http://127.0.0.1:8090/_/
```

Leave this terminal running. On first boot PocketBase will automatically
apply every migration file in [apps/pocketbase/pb_migrations/](apps/pocketbase/pb_migrations/),
which creates every collection (`users`, `inspections`, `appointments`,
`chats`, `messages`, `notifications`).

---

## Step 6 — Start the frontend

Open a **second** terminal (**Terminal → New Terminal**, click the `+` icon):

```powershell
cd apps\web
npm run dev
```

You should see:

```
  VITE v5.x  ready in xxx ms
  ➜  Local:   http://localhost:3000/
```

Open <http://localhost:3000> in your browser. You're live.

---

## Step 7 — First-run admin setup (only if `pb_data/` is empty)

If this is a fresh install (you didn't bring over your old `pb_data/`),
create the first admin:

1. Visit <http://127.0.0.1:8090/_/> — PocketBase admin UI.
2. Set the superuser email + password (this is PocketBase's "owner" login,
   separate from the app's admin role).
3. Go to **Collections → users → New record**. Create your first app admin:
   - `email` — your email
   - `password` — your password (≥ 8 chars)
   - `passwordConfirm` — same
   - `name` — Your Name
   - `role` — `admin`
   - `verified` — ✅ true
4. Now go to <http://localhost:3000/login> and log in as that admin.

> Full detail on every collection + ready-made commands lives in
> [DATABASE.md](DATABASE.md).

---

## Daily use — what to run every time you reopen the laptop

Just the two `serve` / `dev` commands. **Never** run `npm install` again
unless you delete `node_modules` or someone adds a package.

```powershell
# Terminal 1
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090

# Terminal 2
cd apps\web
npm run dev
```

Or, from the project root, the convenience script runs both at once:

```powershell
npm run dev
```

---

## Building for production

```powershell
npm run build       # outputs static site to dist/apps/web
npm run start       # serves built site + PocketBase together
```

For Hostinger / VPS deploy notes, see your existing
`/memories/repo/inspectpro-hostinger-deploy.md` file.

---

## Common problems

| Symptom | Fix |
|---|---|
| `node` / `npm` not recognized | Close + reopen VS Code after installing Node |
| `pocketbase.exe : The term is not recognized` | You missed step 3 — copy `pocketbase.exe` into `apps\pocketbase\` |
| `EADDRINUSE :3000` or `:8090` | Another instance is already running. Close that terminal, or change port. |
| Cannot log in / no users exist | You started fresh without `pb_data` — do **Step 7** |
| Avatars / photos broken after copy | Make sure you copied **`apps/pocketbase/pb_data/storage/`** along with the rest |
| Admin actions get "403 Forbidden" | Your user's `role` field is not `admin`. Edit it in the PB admin UI. |
| Migrations didn't auto-apply | Stop PocketBase, delete `pb_data/data.db-shm` + `data.db-wal`, restart |

---

## Repo layout cheat sheet

```
apps/
  web/                  ← React frontend (Vite)
    src/pages/          ← Routes (one .jsx per page)
    src/components/     ← Re-usable UI
    src/contexts/       ← Auth, Settings, Chat, Feedback (React Context)
    src/utils/          ← ReportGenerator.jsx (PDF + DOCX export)
  pocketbase/           ← Backend
    pocketbase.exe      ← (you copy this in)
    pb_migrations/      ← Auto-applied DB schema migrations
    pb_hooks/           ← Server-side JS hooks (mailer, etc.)
    pb_data/            ← SQLite DB + uploaded files (NEVER commit; DO copy when migrating)
package.json            ← npm workspace root
```

See [CONSTRUCTIONS.md](CONSTRUCTIONS.md) for the architecture deep-dive and
per-role user guides.

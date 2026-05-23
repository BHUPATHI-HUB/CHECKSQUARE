# CheckSquare / InspectPro

Property inspection app — React 18 frontend + PocketBase backend.

Live frontend: <https://checksquare.pages.dev>
Repo: <https://github.com/BHUPATHI-HUB/CHECKSQUARE>

---

## 📚 Documentation map — start here

Every guide lives in a `.md` file at the repo root. Pick the one that
matches what you're trying to do:

| If you want to… | Read | What it covers |
|---|---|---|
| **Install on a new laptop for the first time** | [SETUP.md](SETUP.md) | Node/Git install, PocketBase binary, `npm install`, run both servers |
| **Understand the architecture / what each page does** | [CONSTRUCTIONS.md](CONSTRUCTIONS.md) | Tech stack, folder map, per-role walkthrough (admin/inspector/customer) |
| **Create the first admin user / inspect the schema** | [DATABASE.md](DATABASE.md) | 7 collections, API rules, superuser creation, seed scripts |
| **Move data (users + photos + DB) to another laptop** | [BACKUP.md](BACKUP.md) | `backup-pb.ps1` + `restore-pb.ps1` + 8-step new-laptop walkthrough |
| **Publish live for free, no credit card** | [DEPLOY-FREE.md](DEPLOY-FREE.md) | Cloudflare Tunnel + Cloudflare Pages |
| **Publish 24/7 on a real server** | [DEPLOY.md](DEPLOY.md) | Fly.io (free tier, credit card required) |
| **Publish on Hostinger Horizons** | [HOSTINGER.md](HOSTINGER.md) | The platform the project was originally built on |
| **Hand the project to an AI agent** | [AGENTS.md](AGENTS.md) | Copilot / Claude / Cursor — tells them exactly what to do |
| **See what changed recently** | [CHANGELOG.md](CHANGELOG.md) | Release notes |

### Helper scripts (run these directly)

| Script | What it does |
|---|---|
| [setup.ps1](setup.ps1) | One-click install: downloads PocketBase + runs `npm install` |
| [start-tunnel.ps1](start-tunnel.ps1) | Starts PocketBase + Cloudflare Quick Tunnel (for DEPLOY-FREE) |
| [backup-pb.ps1](backup-pb.ps1) | Zips `pb_data/` → `backups/pb_backup_<timestamp>.zip` |
| [restore-pb.ps1](restore-pb.ps1) | Unzips a backup back into `pb_data/` |

---

## 🚀 Quick start (Windows)

```powershell
git clone https://github.com/BHUPATHI-HUB/CHECKSQUARE.git
cd CHECKSQUARE
powershell -ExecutionPolicy Bypass -File .\setup.ps1

# Terminal 1
cd apps\pocketbase ; .\pocketbase.exe serve --http=127.0.0.1:8090

# Terminal 2
cd apps\web ; npm run dev
```

Then open <http://localhost:3000>. First-admin setup → [DATABASE.md §3](DATABASE.md).

---

## 🗂 Project layout

```
apps/
├── web/                # React 18 + Vite + Tailwind + shadcn/ui  (port 3000)
└── pocketbase/         # PocketBase binary + migrations + hooks  (port 8090)
    ├── pb_migrations/  # auto-applied on startup (schema = code)
    ├── pb_hooks/       # server-side JS hooks
    └── pb_data/        # SQLite DB + uploaded files (GITIGNORED)
```

For full details see [CONSTRUCTIONS.md](CONSTRUCTIONS.md).

---

## ⚠️ Things to never commit

`.gitignore` already excludes these — but verify before pushing:

| Path | Why |
|---|---|
| `apps/pocketbase/pb_data/` | Contains your real DB + every uploaded photo |
| `apps/pocketbase/pocketbase.exe` | OS-specific binary (Linux server uses Linux binary) |
| `backups/` / `pb_backup_*.zip` | Contains hashed passwords + uploaded files |
| `.env`, `.env.local` | Secrets |
| `node_modules/`, `dist/` | Build output |

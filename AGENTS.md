# AGENTS.md — Instructions for AI Coding Agents

> **Purpose:** Hand this file to any AI coding agent (GitHub Copilot, Claude,
> Cursor, etc.) on a fresh laptop and say *"Read AGENTS.md and set the
> project up."* The agent has everything it needs below to install, configure,
> verify, and hand back a working dev environment without further questions.

---

## 0. Ground rules for the agent

- **Read these files first** (in this order):
  1. This file (`AGENTS.md`)
  2. [SETUP.md](SETUP.md)
  3. [DATABASE.md](DATABASE.md)
  4. [CONSTRUCTIONS.md](CONSTRUCTIONS.md)
  5. [DEPLOY-FREE.md](DEPLOY-FREE.md) — only if the user asks to deploy / publish / host
  6. [DEPLOY.md](DEPLOY.md) — only if the user has a credit card and wants Fly.io
- **Operating system assumed:** Windows 10/11 with PowerShell. If the host
  is macOS or Linux, adapt the binary download URL (see §3.2) and use `sh`
  equivalents; do **not** ask the user which OS — detect from `$IsWindows` /
  `uname`.
- **Never delete `apps/pocketbase/pb_data/`** without explicit user
  confirmation — it contains the database and every uploaded photo.
- **Do not run `npm audit fix --force`**, `git push`, `git reset --hard`,
  or anything that mutates remote state.
- If a step fails, **stop and report** instead of trying random fixes.
- Use the **idempotent** form of every command (re-running the script must
  not corrupt state).

---

## 1. Required outcome (definition of done)

When you (the agent) are finished, the user must be able to:

1. Open <http://localhost:3000> and see the React frontend load.
2. Open <http://127.0.0.1:8090/_/> and see the PocketBase admin UI.
3. Log in to the React app as an admin and reach `/admin/dashboard`,
   `/admin/users`, `/admin/settings` without 404 / 403 errors.

If all three pass, print a green **`✅ Setup complete`** banner and the
user-facing summary in §8.

---

## 2. Step-by-step plan (the agent must follow this order)

Create a todo list and tick items off as you go:

1. Verify project root (must contain `package.json` + `apps/`).
2. Check Node.js ≥ 18 and npm presence.
3. Install / verify the PocketBase binary in `apps/pocketbase/`.
4. Run `npm install` at the project root.
5. Start the backend (PocketBase) in **terminal A** (async).
6. Wait for `Server started at http://127.0.0.1:8090` in its output.
7. Start the frontend (Vite) in **terminal B** (async).
8. Wait for `Local: http://localhost:3000` in its output.
9. Probe both URLs with an HTTP GET; require HTTP 200.
10. Detect whether `users` collection has any record with `role = 'admin'`.
    If none → guide the user to create one (§5).
11. Print the §8 summary.

---

## 3. Detailed commands

### 3.1 — Sanity checks
```powershell
# Must be at project root
if (-not (Test-Path .\package.json)) { throw "Run from project root" }
if (-not (Test-Path .\apps\pocketbase)) { throw "apps/pocketbase missing" }

# Node check
$nodeVer = (node -v) 2>$null
if (-not $nodeVer) { throw "Install Node 20 LTS first: https://nodejs.org" }
```

### 3.2 — Install the PocketBase binary (idempotent)
```powershell
$pbDir = "apps\pocketbase"
$pbExe = Join-Path $pbDir "pocketbase.exe"   # use "pocketbase" on macOS/Linux
$pbVer = "0.26.9"                            # matches the JS SDK in package.json

if (-not (Test-Path $pbExe)) {
  $os = if ($IsLinux) {"linux"} elseif ($IsMacOS) {"darwin"} else {"windows"}
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {"arm64"} else {"amd64"}
  $url = "https://github.com/pocketbase/pocketbase/releases/download/v$pbVer/pocketbase_${pbVer}_${os}_${arch}.zip"
  $tmp = "$env:TEMP\pb_$pbVer.zip"
  Invoke-WebRequest -Uri $url -OutFile $tmp
  Expand-Archive -LiteralPath $tmp -DestinationPath "$env:TEMP\pb_extract" -Force
  Copy-Item "$env:TEMP\pb_extract\pocketbase*" $pbExe -Force
  Remove-Item $tmp, "$env:TEMP\pb_extract" -Recurse -Force
}
```

> **Shortcut:** the same logic is already packaged in [setup.ps1](setup.ps1).
> Prefer running that script over re-implementing it:
> ```powershell
> powershell -ExecutionPolicy Bypass -File .\setup.ps1
> ```

### 3.3 — Install npm dependencies
```powershell
npm install        # root; npm workspaces installs both apps/web and apps/pocketbase
```

### 3.4 — Start backend (async terminal)
```powershell
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090
# Wait until output contains: "Server started at http://127.0.0.1:8090"
```

### 3.5 — Start frontend (separate async terminal)
```powershell
cd apps\web
npm run dev
# Wait until output contains: "Local:   http://localhost:3000/"
```

### 3.6 — Probe both services
```powershell
try { (Invoke-WebRequest http://127.0.0.1:8090/api/health -UseBasicParsing).StatusCode } catch { 0 }
try { (Invoke-WebRequest http://localhost:3000/        -UseBasicParsing).StatusCode } catch { 0 }
# Both should return 200.
```

---

## 4. What lives where (so you don't hunt)

| Concern | File |
|---|---|
| Routes + role guards | [apps/web/src/App.jsx](apps/web/src/App.jsx) |
| Auth context | [apps/web/src/contexts/AuthContext.jsx](apps/web/src/contexts/AuthContext.jsx) |
| PocketBase client | [apps/web/src/lib/pocketbaseClient.js](apps/web/src/lib/pocketbaseClient.js) |
| Inspection 5-phase wizard | [apps/web/src/components/InspectionForm.jsx](apps/web/src/components/InspectionForm.jsx) |
| PDF + DOCX export | [apps/web/src/utils/ReportGenerator.jsx](apps/web/src/utils/ReportGenerator.jsx) |
| User management page | [apps/web/src/pages/AdminUserManagementPage.jsx](apps/web/src/pages/AdminUserManagementPage.jsx) |
| Collection migrations | [apps/pocketbase/pb_migrations/](apps/pocketbase/pb_migrations/) |
| Server-side hooks | [apps/pocketbase/pb_hooks/](apps/pocketbase/pb_hooks/) |
| DB + uploaded files | `apps/pocketbase/pb_data/` (do **NOT** delete) |

---

## 5. First-time admin creation (only if `users` is empty)

Detection query (run after backend is up):
```powershell
try {
  $r = Invoke-RestMethod "http://127.0.0.1:8090/api/collections/users/records?perPage=1&filter=role='admin'"
  $hasAdmin = ($r.totalItems -gt 0)
} catch { $hasAdmin = $false }
```

If `$hasAdmin` is false, **do not silently create a user with a default
password**. Instead, print:

```
⚠  No admin user found. Open http://127.0.0.1:8090/_/ to:
   1) Create the PocketBase superuser (master DB account).
   2) Then Collections → users → New record:
        email = your email
        password = ≥ 8 chars
        name = Your Name
        role = admin
        verified = true
   See DATABASE.md §3 for the full procedure.
```

If the user explicitly asks you to seed test users, use the snippet in
[DATABASE.md §4](DATABASE.md) and tell them the credentials you used.

---

## 6. Verification matrix

Run these after both servers are up. The agent should report PASS/FAIL for
each line:

| Check | Command | Pass criteria |
|---|---|---|
| Backend reachable | `Invoke-WebRequest http://127.0.0.1:8090/api/health` | HTTP 200 |
| Frontend reachable | `Invoke-WebRequest http://localhost:3000/` | HTTP 200 + body contains `<div id="root"` |
| Migrations applied | `Invoke-RestMethod http://127.0.0.1:8090/api/collections` (auth as superuser) | Contains `users`, `inspections`, `appointments`, `chats`, `messages`, `notifications`, `app_settings` |
| Avatar field present | `(Invoke-RestMethod .../collections/users).fields.name` | Includes `avatar` |
| Admin update rule | same query | `updateRule` contains `@request.auth.role = 'admin'` |

---

## 7. Troubleshooting decision tree (for the agent)

```
npm install fails with EACCES / EPERM
   → user is on OneDrive path; ask them to move project to C:\Projects\

pocketbase.exe : "is not recognized"
   → step 3.2 failed; check the URL responded 200 and the zip extracted

Port 8090 already in use
   → another PB instance running; ask user before killing it

Port 3000 already in use
   → safe to run on 3001:  cd apps\web; npm run dev -- --port 3001

403 on every API call
   → user's role is wrong; open PB admin UI and set users.role = admin

404 on /admin/users in browser
   → migration 1779700001_users_admin_manage didn't apply; restart PB

Avatar uploads return 400 "invalid field 'avatar'"
   → migration 1779700002_users_avatar_field didn't apply; restart PB
```

If a problem is **not** on this list: stop, summarize what failed (include
the exact error), and ask the user how to proceed. Do **not** start
guessing fixes.

---

## 8. Final summary template (print verbatim when done)

```
✅ Setup complete

Backend  : http://127.0.0.1:8090
Admin UI : http://127.0.0.1:8090/_/
Frontend : http://localhost:3000

Next steps:
  • If you have not yet, create your first admin (DATABASE.md §3)
  • Log in at http://localhost:3000/login
  • Read CONSTRUCTIONS.md for the architecture + per-role walkthrough

To stop the servers: Ctrl+C in each terminal.
To restart later  : open two terminals and run
                      (a) cd apps\pocketbase ; .\pocketbase.exe serve --http=127.0.0.1:8090
                      (b) cd apps\web        ; npm run dev
```

---

## 9. Deployment (only when the user asks to deploy / publish / host)

There are two supported paths. **Pick based on whether the user has a credit card.**

### 9.1 Decision tree
```
Does the user have a credit/debit card (incl. virtual prepaid)?
  ├── NO  → §9.2  Cloudflare Tunnel + Cloudflare Pages   (₹0, laptop must stay on)
  └── YES → §9.3  Fly.io + Cloudflare Pages              (₹0 within free tier, 24/7)
```

Hosts that **don't** work for this app:
- **Render / Vercel / Koyeb free tier** — no persistent disk; PocketBase DB wipes on redeploy.
- **PocketHost.io** — free tier no longer runs instances (as of 2026); requires paid plan.

### 9.2 No-CC path — Cloudflare Tunnel + Pages
Full walkthrough lives in [DEPLOY-FREE.md](DEPLOY-FREE.md). Agent summary:

1. Verify `cloudflared` is installed; if not, install + remind user to restart PowerShell:
   ```powershell
   if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
     winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
     # PATH not refreshed in current session — agent must use full path until next shell:
     $cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
   }
   ```
2. Run `.\start-tunnel.ps1` (already in repo). It starts PocketBase + a Quick Tunnel and prints a `https://*.trycloudflare.com` URL. **Capture that URL — call it `$PB_URL`.** Verify it returns HTTP 200 at `$PB_URL/api/health` before continuing.
3. Push latest code: `git add . ; git commit -m "deploy" ; git push`.
4. **User action required** (browser, can't automate): create a Cloudflare Pages project from `BHUPATHI-HUB/CHECKSQUARE` (or fork). **⚠️ User must click the "Pages" tab at the top, NOT "Workers"** — Workers UI shows "Deploy command" / "Build token" fields and will fail. The Pages form has these EXACT values:
   | Field | Exact value |
   |---|---|
   | Framework preset | None |
   | Build command | `npm install && npm run build --workspace apps/web` |
   | **Build output directory** | **`dist/apps/web`** ← not `web`, not `apps/web`, not `/dist/apps/web` |
   | Root directory | *(blank)* |
   | Env var `VITE_PB_URL` | `$PB_URL` (no trailing slash) |
   | Env var `NODE_VERSION` | `20` |
5. **User action required:** in PocketBase admin (`http://127.0.0.1:8090/_/`) → Settings → Application → Application URL → paste the `*.pages.dev` URL (CORS fix; without this login fails silently).
6. Agent smoke test:
   ```powershell
   (Invoke-WebRequest "$PB_URL/api/health" -UseBasicParsing).StatusCode    # expect 200
   $html = (Invoke-WebRequest "https://<project>.pages.dev/" -UseBasicParsing).Content
   if ($html -match '/src/main\.jsx') { Write-Host "❌ Output dir wrong — fix in Pages settings to dist/apps/web" }
   elseif ($html -match '/assets/index-[A-Za-z0-9]+\.js') { Write-Host "✅ Deployed correctly" }
   ```

Caveats the agent must surface to the user:
- Quick Tunnel URL **changes on every restart** unless they own a domain (then use Named Tunnel — see DEPLOY-FREE.md §8). Each rotation requires updating `VITE_PB_URL` in Pages + redeploy.
- Backend goes down when laptop sleeps. Tell the user to set Power → Sleep → Never while plugged in.
- If user accidentally creates a superuser with literal placeholder text (e.g. `your-email@example.com`), guide them to re-run `pocketbase.exe superuser upsert <real_email> "<real_password>"` (`upsert` adds-or-updates, keep password in quotes).

### 9.3 Paid path — Fly.io + Cloudflare Pages
See [DEPLOY.md](DEPLOY.md). Agent summary:

1. `iwr https://fly.io/install.ps1 -useb | iex` then `fly auth login` (user does browser auth).
2. `cd apps\pocketbase ; fly launch --no-deploy --copy-config --name checksquare-pb --region bom`
3. `fly volumes create pb_data --region bom --size 1`
4. `fly secrets set PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=...`
5. `fly deploy`
6. Cloudflare Pages setup identical to §9.2 step 4, but `VITE_PB_URL=https://checksquare-pb.fly.dev`.

Existing config files (already in repo, agent must NOT recreate):
- [apps/pocketbase/Dockerfile](apps/pocketbase/Dockerfile)
- [apps/pocketbase/fly.toml](apps/pocketbase/fly.toml)
- [apps/pocketbase/.dockerignore](apps/pocketbase/.dockerignore)
- [apps/web/.env.example](apps/web/.env.example)
- [apps/web/src/lib/pocketbaseClient.js](apps/web/src/lib/pocketbaseClient.js) — already env-aware (reads `VITE_PB_URL`)

### 9.4 What the agent must NEVER do during deploy
- Don't create a credit card or sign up for the user.
- Don't paste secrets (SMTP keys, passwords) into commits or markdown.
- Don't push `pb_data/` to GitHub — `.gitignore` already excludes it; verify before `git add .`.
- Don't change `VITE_PB_URL` in source code. It belongs in Cloudflare Pages env vars only.
- Don't recommend Render/Vercel/Koyeb for the backend — they will silently wipe the DB.

---

## 10. What you (the agent) should NOT do unless asked


- Don't reformat existing source files.
- Don't add dependencies. The `package.json` is authoritative.
- Don't write to `pb_migrations/` — that changes the DB schema for everyone.
- Don't disable ESLint / Tailwind config.
- Don't bake real secrets (SMTP keys, etc.) into the repo. Use env vars.
- Don't generate documentation (`*.md`) unless the user explicitly requests it.

---

## 10. When the user asks for a feature, follow this loop

1. Identify the affected layer (frontend route, component, context, or
   migration) using §4.
2. Read the existing file end-to-end before editing.
3. Make the smallest possible change that fulfils the request.
4. Run `npm run lint --workspace apps/web` if you touched `.jsx`.
5. Validate with the matrix in §6.
6. Report exactly what changed and which files were touched, with links.

---

## 11. When the user asks to deploy, follow this loop

1. Ask **one** question only: *"Do you have a credit/debit card (any virtual prepaid card works too)?"*
2. If **no** → follow §9.2 (Cloudflare Tunnel + Pages). Run `.\start-tunnel.ps1`.
3. If **yes** → follow §9.3 (Fly.io). Run the 5 commands in order.
4. For **both paths**, the Cloudflare Pages part is identical — the user must do steps 4–5 in a browser; do not pretend you can automate them.
5. After deploy, smoke-test:
   ```powershell
   Invoke-WebRequest "$BACKEND_URL/api/health"   # expect 200
   Invoke-WebRequest "$FRONTEND_URL"             # expect 200
   ```
6. Report the two URLs + remind the user to set Application URL in PB admin for CORS.

---

End of agent instructions. For human-readable docs, point the user at
[SETUP.md](SETUP.md), [CONSTRUCTIONS.md](CONSTRUCTIONS.md),
[DATABASE.md](DATABASE.md), and [DEPLOY-FREE.md](DEPLOY-FREE.md).

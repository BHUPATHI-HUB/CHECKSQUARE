# DEPLOY-FREE.md — Zero-cost, no-credit-card deployment

> **Architecture:** Backend (PocketBase) runs on **your laptop** and is exposed
> to the public Internet through a free **Cloudflare Tunnel**. Frontend
> (React/Vite) is built and hosted free on **Cloudflare Pages**.
>
> **Cost:** ₹0 / month forever.
> **Catch:** the backend only responds while your laptop is on and unblocked.
> Perfect for demos, portfolios, and small private deployments.
>
> ✅ **Verified working** on Windows 11 + PowerShell 7 on May 24, 2026 by
> deploying this very repo to `https://checksquare.pages.dev`.

---

## TL;DR — the entire flow in 30 seconds

1. `git clone` the repo
2. `setup.ps1` (installs PocketBase + npm deps)
3. `winget install Cloudflare.cloudflared` (then **close + reopen PowerShell**)
4. `.\start-tunnel.ps1` (starts PB + prints a public `*.trycloudflare.com` URL)
5. Cloudflare Pages → connect GitHub → set output dir `dist/apps/web` + env `VITE_PB_URL=<url from step 4>`
6. PocketBase admin → Settings → Application URL → paste the `*.pages.dev` URL (CORS fix)
7. Open `https://<your-project>.pages.dev` → log in → done

---

## Prerequisites (one-time, per laptop)

1. Windows 10/11 with PowerShell
2. **Node.js 20 LTS** — <https://nodejs.org>
3. **Git** — <https://git-scm.com/download/win>
4. A **free Cloudflare account** — <https://dash.cloudflare.com/sign-up>
   (email + password only, **no credit card** required)
5. A **GitHub account** (for the existing fork at `BHUPATHI-HUB/CHECKSQUARE`)

---

## Step 1 — Clone the repo on the new laptop

```powershell
cd $HOME
git clone https://github.com/BHUPATHI-HUB/CHECKSQUARE.git
cd CHECKSQUARE
```

## Step 2 — Run the local setup script

This installs the PocketBase binary + all npm dependencies.

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

Verify locally before deploying:

```powershell
# Terminal A — backend
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090

# Terminal B — frontend (new window)
cd apps\web
npm run dev
```

Open <http://localhost:3000> — you should see the login page.

### 2a — Create the first superuser (one-time, only on a brand-new pb_data)

Two options:

**Option A — browser** (easiest):
Open <http://127.0.0.1:8090/_/> the first time PocketBase runs. It shows a
setup wizard. Pick your email + password. Save.

**Option B — CLI**:
```powershell
cd apps\pocketbase
.\pocketbase.exe superuser upsert YOUR_REAL_EMAIL "YOUR_REAL_PASSWORD"
```

> ⚠️ **Do not type the literal placeholder text.** Replace `YOUR_REAL_EMAIL`
> with e.g. `admin@yourdomain.com` and `YOUR_REAL_PASSWORD` with a real
> password ≥ 10 chars. Keep the **quotes** around the password — special
> characters like `!` break without them.

Stop both terminals (`Ctrl+C` in each) once login works. Steps 3+ restart them.

---

## Step 3 — Install Cloudflare Tunnel (`cloudflared`)

```powershell
winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
```

### 3a — Critical: cloudflared is not on PATH right after install

After winget finishes, **close and reopen PowerShell** so it picks up the new
PATH entry. Otherwise `cloudflared --version` will fail with "not recognized".

If PATH is still broken after restart, the binary lives at:
```
C:\Program Files (x86)\cloudflared\cloudflared.exe
```
You can call it with the full path or add it to PATH manually:
```powershell
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files (x86)\cloudflared", "User")
```

Verify:
```powershell
cloudflared --version
# expected: cloudflared version 2026.x.x
```

---

## Step 4 — Start backend + tunnel (the recurring daily command)

The repo ships a helper script that does both in one go:

```powershell
.\start-tunnel.ps1
```

This:
1. Opens a new PowerShell window running PocketBase on `http://127.0.0.1:8090`
2. Starts `cloudflared` in the current window and prints a URL like:
   ```
   https://reputation-parent-impacts-thinkpad.trycloudflare.com
   ```

### 4a — Copy that URL — you need it for Step 5

It looks like four random words plus `.trycloudflare.com`. Smoke test it:
```powershell
Invoke-WebRequest "https://<your-tunnel-url>/api/health" -UseBasicParsing
# expected: StatusCode 200, body {"message":"API is healthy.","code":200,"data":{}}
```

> ⚠️ **The Quick Tunnel URL changes every time `cloudflared` restarts.**
> If you Ctrl+C the tunnel terminal, a new URL is generated next time. You
> must then update `VITE_PB_URL` in Cloudflare Pages → Settings → Environment
> Variables → trigger a redeploy. See Step 8 for the permanent-URL upgrade.

---

## Step 5 — Deploy the frontend to Cloudflare Pages

1. Push your latest code to GitHub (if you made local changes):
   ```powershell
   git add . ; git commit -m "deploy" ; git push
   ```
2. Open <https://dash.cloudflare.com> → **Workers & Pages**.
3. Click **Create application**. **⚠️ At the top of the screen, click the
   "Pages" tab** — NOT "Workers". If you see "Build token" or "Deploy
   command: `npx wrangler deploy`", you are on the wrong tab.
4. **Connect to Git** → authorize GitHub → pick `BHUPATHI-HUB/CHECKSQUARE`
   (or your fork) → branch `main`.
5. **Set up builds and deployments** — fill in EXACTLY these values:

   | Field | Value |
   |---|---|
   | Project name | `checksquare` (or your preferred slug) |
   | Production branch | `main` |
   | Framework preset | **None** |
   | Build command | `npm install && npm run build --workspace apps/web` |
   | **Build output directory** | **`dist/apps/web`** ← exact, no leading slash |
   | Root directory (advanced) | *(leave blank)* |

   > ⚠️ **Common mistake**: `web`, `apps/web`, and `/dist/apps/web` are all
   > WRONG. The Vite config writes to `../../dist/apps/web` from
   > `apps/web/` → that becomes literally `dist/apps/web` from the repo root.
   > Pages will fail with `Error: Output directory "web" not found` or it
   > will deploy your source code and show a blank page.

6. Expand **Environment variables (advanced)** → click **+ Add variable**
   **twice**:

   | Variable name | Value |
   |---|---|
   | `VITE_PB_URL` | `https://<your-tunnel-url-from-Step-4>` (no trailing slash) |
   | `NODE_VERSION` | `20` |

7. Click **Save and Deploy**. Wait ~2 minutes.
8. You get a URL like `https://checksquare.pages.dev`. **Copy it.**

### 5a — Verify the build deployed the right files

```powershell
(Invoke-WebRequest 'https://checksquare.pages.dev/' -UseBasicParsing).Content | Select-String 'script'
```

✅ Correct: shows `<script type="module" crossorigin src="/assets/index-XXXXXXXX.js">`
❌ Wrong:   shows `<script type="module" src="/src/main.jsx">` → output dir is wrong.
            Go back to Settings → Build → Edit → set `dist/apps/web` →
            Deployments → Retry deployment.

---

## Step 6 — Allow Cloudflare Pages to call your backend (CORS)

Without this, the live site loads but **login fails silently** with a CORS error.

1. Open `http://127.0.0.1:8090/_/` (your local PocketBase admin)
2. Log in with your superuser email + password
3. **Settings** (gear icon in sidebar) → **Application**
4. **Application URL** field → paste your Pages URL:
   ```
   https://checksquare.pages.dev
   ```
5. **Save**

---

## Step 7 — Smoke test

Open <https://checksquare.pages.dev> in a fresh browser tab and verify:

| Test | Expected |
|---|---|
| Page renders login form (not blank) | ✅ |
| Log in with your admin email/password | ✅ lands on dashboard |
| Go to `/admin/users` | ✅ user list shows |
| Upload an avatar | ✅ image renders |
| Open the URL on your phone | ✅ same app works |

If anything fails, press **F12** in browser → **Console** tab → screenshot the
red error and consult the troubleshooting table below.

---

## Step 8 — (Optional) Permanent URL via Named Tunnel

Only needed if you own a domain on Cloudflare and want a stable URL like
`pb.yourdomain.com` that survives `cloudflared` restarts.

```powershell
cloudflared tunnel login                              # browser auth, pick your domain
cloudflared tunnel create checksquare-pb              # one-time
cloudflared tunnel list                               # note the TUNNEL ID
```

Create `C:\Users\<you>\.cloudflared\config.yml`:

```yaml
tunnel: <TUNNEL-ID-FROM-STEP-5>
credentials-file: C:\Users\<you>\.cloudflared\<TUNNEL-ID>.json

ingress:
  - hostname: pb.yourdomain.com
    service: http://127.0.0.1:8090
  - service: http_status:404
```

Route DNS + run:

```powershell
cloudflared tunnel route dns checksquare-pb pb.yourdomain.com
cloudflared tunnel run checksquare-pb
```

Then update `VITE_PB_URL` in Cloudflare Pages → Settings → Environment
Variables → `https://pb.yourdomain.com` → trigger redeploy.

To start it via the helper script every day:
```powershell
.\start-tunnel.ps1 -Named checksquare-pb
```

---

## Daily startup routine (after first-time setup)

Every time you want the app to be reachable on the public Internet:

```powershell
cd $HOME\CHECKSQUARE
.\start-tunnel.ps1
```

Then (Quick Tunnel only — skip if using Named Tunnel):
1. **Copy the new `*.trycloudflare.com` URL** the tunnel prints
2. Cloudflare Pages → Settings → Environment Variables → edit `VITE_PB_URL` →
   paste the new URL → Save
3. Deployments → Create deployment → Retry deployment (or just push a commit)

---

## Troubleshooting (real issues we hit and fixed)

| Problem | Cause | Fix |
|---|---|---|
| `cloudflared` not recognized after install | PATH not refreshed | Close + reopen PowerShell |
| Pages screen has "Deploy command: `npx wrangler deploy`" | You're on Workers tab, not Pages | Back out → top of screen → click **Pages** tab |
| Build fails: `Error: Output directory "web" not found` | Output dir typo | Set to exactly `dist/apps/web` and retry |
| Site loads blank, HTML shows `/src/main.jsx` | Output dir wrong → serving source code | Set output dir to `dist/apps/web` → Deployments → Retry deployment |
| Login fails with CORS error in console | Application URL not set in PB admin | Step 6 |
| Login fails: "Failed to fetch" | Tunnel URL in `VITE_PB_URL` is stale | Get fresh URL from cloudflared output → update Pages env → redeploy |
| Quick Tunnel URL changes every restart | Expected — it's an anonymous tunnel | Use Named Tunnel (Step 8) if you have a domain |
| Backend dies when laptop sleeps | Expected | Settings → Power → Sleep → "Plugged in: Never" |
| Superuser created with literal placeholder text (e.g. `your-email@example.com`) | Copy-pasted the example unchanged | Run `superuser upsert` again with your real email/password |
| `Invoke-WebRequest http://127.0.0.1:8090/api/health` fails | PocketBase not running | Start it: `.\apps\pocketbase\pocketbase.exe serve --http=127.0.0.1:8090` |

---

## Moving to a paid 24/7 host later

When you outgrow this setup (need uptime independent of your laptop), the
easiest upgrade is **Fly.io** (₹0 within free tier, requires a credit card).
The Dockerfile and `fly.toml` are already in `apps/pocketbase/` — follow
[DEPLOY.md](DEPLOY.md).

---

## What you get with this setup

- ✅ Public HTTPS URL for your backend
- ✅ Globally cached frontend on Cloudflare's CDN
- ✅ Auto-deploys when you `git push`
- ✅ Zero monthly cost
- ✅ Zero credit card required
- ⚠️ Backend needs your laptop awake & online
- ⚠️ Quick Tunnel URL rotates on restart (Named Tunnel fixes this if you own a domain)

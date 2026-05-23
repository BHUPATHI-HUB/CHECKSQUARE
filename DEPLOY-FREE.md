# DEPLOY-FREE.md — Zero-cost, no-credit-card deployment

> **Architecture:** Backend (PocketBase) runs on **your laptop** and is exposed
> to the public Internet through a free **Cloudflare Tunnel**. Frontend
> (React/Vite) is built and hosted free on **Cloudflare Pages**.
>
> **Cost:** ₹0 / month forever.
> **Catch:** the backend only responds while your laptop is on and unblocked.
> Perfect for demos, portfolios, and small private deployments.

---

## Prerequisites (one-time, per laptop)

1. Windows 10/11 with PowerShell
2. **Node.js 20 LTS** — <https://nodejs.org>
3. **Git** — <https://git-scm.com/download/win>
4. A **free Cloudflare account** — <https://dash.cloudflare.com/sign-up>
   (email + password only, **no credit card** required)
5. A **GitHub account** (you already have one: `BHUPATHI-HUB`)

---

## Step 1 — Clone the repo (on the new laptop)

```powershell
cd $HOME
git clone https://github.com/BHUPATHI-HUB/CHECKSQUARE.git
cd CHECKSQUARE
```

## Step 2 — Run the local setup script

This installs PocketBase binary + npm dependencies.

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

Verify locally:

```powershell
# Terminal A — backend
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090

# Terminal B — frontend (in a new window)
cd apps\web
npm run dev
```

Open <http://localhost:3000> — you should see the app.
Open <http://127.0.0.1:8090/_/> — create the PocketBase superuser if you haven't.

**Stop both terminals once you have confirmed it works locally** — Steps 3+ will
restart them in the right mode.

---

## Step 3 — Install Cloudflare Tunnel (`cloudflared`)

```powershell
winget install --id Cloudflare.cloudflared -e
```

Verify:

```powershell
cloudflared --version
```

If `winget` is not available, download the MSI directly:
<https://github.com/cloudflare/cloudflared/releases/latest> →
`cloudflared-windows-amd64.msi` → double-click to install.

---

## Step 4 — Authenticate with Cloudflare

```powershell
cloudflared tunnel login
```

A browser window opens. Sign in with your Cloudflare account. You will be asked
to select a domain — **if you don't own one, skip Step 4–6 and use Step 4-Q
(Quick Tunnel) instead**, which gives you a free `*.trycloudflare.com` URL.

---

## Step 4-Q — Quick Tunnel (no domain needed) ★ EASIEST

This is the path most people want. **Skip Steps 5 + 6** if you use this.

```powershell
# In a new terminal — keep this terminal running
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090
```

Open another terminal:

```powershell
cloudflared tunnel --url http://127.0.0.1:8090
```

After a few seconds you'll see output like:

```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://random-words-1234.trycloudflare.com                                                |
+--------------------------------------------------------------------------------------------+
```

**Copy that URL.** Test it in a browser:
`https://random-words-1234.trycloudflare.com/api/health` → must return
`{"code":200,"message":"API is healthy.","data":{}}`.

> ⚠️ Quick Tunnel URLs **change every time you restart `cloudflared`**.
> Fine for testing; for a permanent URL use Steps 5–6 below (requires a domain).

Skip to **Step 7**.

---

## Step 5 — Named Tunnel (permanent URL, requires a domain on Cloudflare)

Only needed if you want a stable URL like `pb.yourdomain.com` that survives
restarts. Otherwise stick with Step 4-Q.

```powershell
# Create a tunnel (one-time)
cloudflared tunnel create checksquare-pb

# List tunnels — note the TUNNEL ID printed
cloudflared tunnel list
```

## Step 6 — Configure + route the named tunnel

Create `C:\Users\<you>\.cloudflared\config.yml`:

```yaml
tunnel: <TUNNEL-ID-FROM-STEP-5>
credentials-file: C:\Users\<you>\.cloudflared\<TUNNEL-ID>.json

ingress:
  - hostname: pb.yourdomain.com
    service: http://127.0.0.1:8090
  - service: http_status:404
```

Route DNS:

```powershell
cloudflared tunnel route dns checksquare-pb pb.yourdomain.com
```

Run the tunnel:

```powershell
cloudflared tunnel run checksquare-pb
```

Your backend is now at `https://pb.yourdomain.com`.

---

## Step 7 — Deploy the frontend to Cloudflare Pages

1. Push your latest code to GitHub:
   ```powershell
   git add .
   git commit -m "ready for cloudflare deploy"
   git push
   ```
2. Open <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git**.
3. Authorize GitHub and pick `BHUPATHI-HUB/CHECKSQUARE`.
4. **Build configuration:**
   | Field | Value |
   |---|---|
   | Framework preset | None |
   | Build command | `npm install && npm run build --workspace apps/web` |
   | Build output directory | `dist/apps/web` |
   | Root directory | *(leave blank)* |
5. **Environment variables** → click **+ Add variable**:
   | Key | Value |
   |---|---|
   | `VITE_PB_URL` | `https://<your-tunnel-url-from-step-4Q-or-6>` |
   | `NODE_VERSION` | `20` |
6. Click **Save and Deploy**. Wait ~2 minutes.
7. You'll get a URL like `https://checksquare.pages.dev`.

---

## Step 8 — Allow Cloudflare Pages to call your backend (CORS)

1. Open `http://127.0.0.1:8090/_/` (your local PocketBase admin)
2. **Settings** → **Application** → **Application URL**
3. Paste your Cloudflare Pages URL: `https://checksquare.pages.dev`
4. **Save**

Refresh `https://checksquare.pages.dev` → login should now work.

---

## Step 9 — Daily startup routine

Every time you want the app to be live, open **two terminals** and run:

```powershell
# Terminal A
cd $HOME\CHECKSQUARE\apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090
```

```powershell
# Terminal B (only if using Quick Tunnel — Step 4-Q)
cloudflared tunnel --url http://127.0.0.1:8090
# Copy the new trycloudflare.com URL and update VITE_PB_URL in Cloudflare Pages → Settings → Environment Variables → Redeploy
```

For **Named Tunnel** (Step 5–6) the URL is permanent, so just:

```powershell
# Terminal B
cloudflared tunnel run checksquare-pb
```

### Shortcut: use the helper script

```powershell
.\start-tunnel.ps1            # starts both PB + Quick Tunnel
.\start-tunnel.ps1 -Named     # starts both PB + Named Tunnel
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `cloudflared` not recognized | Restart PowerShell after `winget install` |
| Tunnel URL works but login fails with CORS | Step 8 — set Application URL in PB admin |
| Frontend shows blank page | Check browser console; usually `VITE_PB_URL` is wrong in Pages env vars |
| Quick Tunnel URL changed after restart | Expected. Update `VITE_PB_URL` in CF Pages → redeploy. Or use Named Tunnel. |
| Laptop sleeps → app goes down | Settings → Power → Sleep → "Never" while plugged in |
| Firewall blocks cloudflared | Allow it through Windows Defender when prompted |

---

## Moving to a paid host later

When you outgrow this setup (need 24/7 uptime), the easiest upgrade is
**Fly.io** ($0 if you stay within free tier, but requires a credit card).
The Dockerfile and `fly.toml` are already in `apps/pocketbase/` — see
[DEPLOY.md](DEPLOY.md) for that path.

---

## What you get with this setup

- ✅ Public HTTPS URL for your backend
- ✅ Globally cached frontend on Cloudflare's CDN
- ✅ Auto-deploys when you `git push`
- ✅ Zero monthly cost
- ✅ Zero credit card required
- ⚠️ Backend needs your laptop awake & online
- ⚠️ Quick Tunnel URL changes on restart (Named Tunnel fixes this if you own a domain)

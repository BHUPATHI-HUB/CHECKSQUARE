# DEPLOY.md — Free‑tier deployment (Cloudflare Pages + Fly.io)

This guide takes you from a working local project to a **publicly live
URL at $0/month**. Total time: ~30 minutes, mostly waiting for builds.

> Architecture: React frontend on **Cloudflare Pages** (global CDN, free
> forever) + PocketBase backend on **Fly.io** (1 always-on tiny VM + 1 GB
> persistent volume, free forever).
>
> The repo is already prepped with everything needed:
> - [apps/pocketbase/Dockerfile](apps/pocketbase/Dockerfile)
> - [apps/pocketbase/fly.toml](apps/pocketbase/fly.toml)
> - [apps/web/.env.example](apps/web/.env.example)
> - [apps/web/src/lib/pocketbaseClient.js](apps/web/src/lib/pocketbaseClient.js) reads `VITE_PB_URL`

---

## Part 1 — Deploy the backend to Fly.io

### 1.1 — Sign up
1. Go to <https://fly.io/app/sign-up> and sign up with GitHub.
2. Add a credit card (required by Fly, **will not be charged** while you
   stay inside the free tier: 3 VMs × 256 MB + 3 GB volume).

### 1.2 — Install the Fly CLI on your laptop
```powershell
# Windows (PowerShell, run as admin once):
iwr https://fly.io/install.ps1 -useb | iex

# verify
fly version
fly auth login          # opens browser → click Authorize
```

### 1.3 — Launch the app
From the project root:
```powershell
cd apps\pocketbase
fly launch --no-deploy
```

When prompted:
- **App name** → `checksquare-pb` (or anything unique)
- **Region** → pick the one closest to your users (Bombay = `bom`, Singapore = `sin`, Frankfurt = `fra`, Virginia = `iad`)
- **Postgres / Redis / Tigris** → **No** to all (PB uses SQLite locally)
- **Deploy now?** → **No** (we'll create the volume first)
- It may ask to overwrite the existing `fly.toml` → **No** (the one in the repo is correct; just update the `app` and `primary_region` fields if you changed them)

### 1.4 — Create the persistent volume (the disk that holds your DB + photos)
```powershell
fly volumes create pb_data --region bom --size 1
# (use the same region you picked in 1.3, and 1 GB is the free-tier max per volume —
#  you can have up to 3 volumes / 3 GB total free)
```

### 1.5 — (Optional but recommended) Set secrets
```powershell
fly secrets set PB_SUPERUSER_EMAIL="you@example.com"
fly secrets set PB_SUPERUSER_PASSWORD="SomethingStrong!"
# Only if you use the builder-mailer hook:
# fly secrets set BUILDER_MAILER_API_URL="..." BUILDER_MAILER_API_KEY="..." BUILDER_MAILER_SENDER_ADDRESS="..."
```

### 1.6 — Deploy
```powershell
fly deploy
```
Wait 2–4 min. When it finishes you'll see:
```
✓ Machine started, version 1
Visit your newly deployed app at https://checksquare-pb.fly.dev/
```

### 1.7 — First-time admin
Open `https://checksquare-pb.fly.dev/_/` → create the PocketBase superuser
account → go to **Collections → users → New record** and create your first
app admin (`role = admin`, see [DATABASE.md §3](DATABASE.md)).

Your backend is live. **Note the URL** — you'll need it in Part 2.

---

## Part 2 — Deploy the frontend to Cloudflare Pages

### 2.1 — Sign up
1. <https://dash.cloudflare.com/sign-up> → free account.
2. Verify email.

### 2.2 — Connect GitHub
1. Cloudflare dashboard → **Workers & Pages** → **Create application** →
   **Pages** tab → **Connect to Git**.
2. Authorize Cloudflare on GitHub → pick the **BHUPATHI-HUB/CHECKSQUARE** repo.

### 2.3 — Build settings
Fill in exactly:

| Field | Value |
|---|---|
| Project name | `checksquare` (becomes `checksquare.pages.dev`) |
| Production branch | `main` |
| Framework preset | **None** (we configure manually) |
| Build command | `npm install && npm run build --workspace apps/web` |
| Build output directory | `dist/apps/web` |
| Root directory | *(leave blank — project root)* |

### 2.4 — Environment variables
Click **Environment variables → Add**:

| Variable | Value |
|---|---|
| `VITE_PB_URL` | `https://checksquare-pb.fly.dev` *(from Part 1.6)* |
| `NODE_VERSION` | `20` |

### 2.5 — Deploy
Click **Save and Deploy**. First build takes 3–5 min.

You'll get a live URL like `https://checksquare.pages.dev`.

Every future `git push origin main` triggers an automatic redeploy.

---

## Part 3 — Wire CORS so the frontend can talk to the backend

PocketBase 0.26 allows all origins by default, but to be safe pin it to
your Pages URL:

1. Open `https://checksquare-pb.fly.dev/_/` → **Settings → Application**
2. **Application URL** → `https://checksquare.pages.dev`
3. Save.

If you hit CORS errors in the browser console, also visit **Settings →
Authentication** and confirm cookies / CORS settings allow your Pages
origin.

---

## Part 4 — Smoke test

Open `https://checksquare.pages.dev` and verify:

- [ ] Home page loads (no console errors)
- [ ] `/login` accepts your admin credentials
- [ ] `/admin/dashboard` opens (no 403 / no CORS errors in DevTools → Network)
- [ ] `/admin/users` lists users and lets you upload an avatar
- [ ] Create a test inspection → it persists after a refresh (proves the
      volume mount is working)
- [ ] Refresh the Fly machine: `fly machine restart` — data is still there

If everything passes, you're done. 🎉

---

## Part 5 — Updating the live site

Just push to `main`:

```powershell
git add .
git commit -m "your change"
git push
```

- **Frontend** → Cloudflare auto-builds from the push and deploys to
  `https://checksquare.pages.dev`.
- **Backend** → you have to re-run `fly deploy` from `apps/pocketbase/`
  manually (Fly does not auto-deploy by default). To make it automatic, see
  Part 7.

---

## Part 6 — Costs at a glance

| Resource | Free tier | What you're using |
|---|---|---|
| Cloudflare Pages | Unlimited bandwidth, unlimited requests | ~few MB |
| Fly.io compute | 3 × shared-cpu-1x VMs × 256 MB | 1 VM |
| Fly.io storage | 3 GB total volume + 3 GB image registry | 1 GB volume |
| Fly.io egress | 160 GB/mo | trivial unless you have heavy traffic |
| **Monthly bill** | — | **$0.00** |

You'll only ever get charged if you exceed any of the above. Set up usage
alerts in the Fly dashboard if you're paranoid.

---

## Part 7 (optional) — Auto-deploy the backend from GitHub Actions

Add this file at `.github/workflows/fly-deploy.yml`:

```yaml
name: Fly Deploy
on:
  push:
    branches: [main]
    paths: ["apps/pocketbase/**"]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only -c apps/pocketbase/fly.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Get the token with `fly tokens create deploy` and add it as a secret named
`FLY_API_TOKEN` in your GitHub repo settings. Now every push that touches
`apps/pocketbase/**` redeploys the backend automatically.

---

## Common problems

| Symptom | Fix |
|---|---|
| Cloudflare build fails on `npm install` | Set `NODE_VERSION=20` in env vars (Pages defaults to 18) |
| 404 on subroutes (e.g. `/admin/users` direct reload) | Cloudflare Pages auto-handles SPA fallback for Vite. If not, add a `_redirects` file in `apps/web/public/` with: `/*  /index.html  200` |
| `Failed to fetch` / CORS in browser console | Re-check `VITE_PB_URL` is the **exact** Fly origin (with `https://`, no trailing slash); confirm the value in **Pages → Deployments → Build log → Environment** |
| `disk is full` on Fly | Grow the volume: `fly volumes extend <volume-id> --size 3` (still free up to 3 GB total) |
| Want to download a backup of `pb_data` | `fly ssh sftp shell` → `get -r /pb_data ./pb_data_backup` |
| Want to wipe & start fresh | `fly ssh console -C "rm -rf /pb_data/data.db /pb_data/data.db-shm /pb_data/data.db-wal"`, then `fly machine restart` |

---

For the local-dev story, see [SETUP.md](SETUP.md). For the existing
Hostinger setup, leaving the codebase here untouched still works — the new
`VITE_PB_URL` fallback (`/hcgi/platform`) is what Hostinger expects.

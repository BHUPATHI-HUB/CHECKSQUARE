# CheckSquare setup

The active application is React + Vite/PWA with a Capacitor Android shell and **Supabase only**. PocketBase files and older hosting guides are retained as historical material; do not use them to configure this release.

1. Install Node 22 and run `npm ci --ignore-scripts --no-audit --no-fund` from the repository root.
2. Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) to prepare a staging database, private Storage buckets and the admin Edge Function.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `apps/web/.env.local` using `.env.example`. Never put a service-role key in a browser variable.
4. Run `npm run dev`; open `http://localhost:3000`.
5. Run `npm test`, `npm run lint` and `npm run build` before publication. Output: `dist/apps/web`.

Missing Supabase configuration prevents live authentication/data access. It never silently selects PocketBase.

For an explicit sample-data preview, build with `VITE_DEMO_MODE=true npm run build`. The amber banner identifies synthetic data and lets you explore all roles. Preview mode is disabled when `VITE_SUPABASE_URL` is configured. Do not use it for real inspections.

See [ANDROID.md](ANDROID.md) for native builds. Old `setup.ps1`, `start-tunnel.ps1` and PocketBase backup scripts apply only to archived deployments.

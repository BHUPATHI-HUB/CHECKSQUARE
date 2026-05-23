import Pocketbase from 'pocketbase';

// PB URL resolution order:
//   1. VITE_PB_URL build-time env (set in Cloudflare Pages / Vercel / .env)
//   2. window.__PB_URL__ runtime override (handy for ad-hoc testing)
//   3. '/hcgi/platform' fallback so existing Hostinger Horizons deploy keeps working
const RUNTIME_URL =
	typeof window !== 'undefined' && window.__PB_URL__ ? window.__PB_URL__ : null;
const POCKETBASE_API_URL =
	RUNTIME_URL || import.meta.env?.VITE_PB_URL || '/hcgi/platform';

const pocketbaseClient = new Pocketbase(POCKETBASE_API_URL);

export default pocketbaseClient;

export { pocketbaseClient, POCKETBASE_API_URL };

// Supabase client — additive to PocketBase.
//
// PocketBase remains the system of record. Supabase is used (so far) for:
//   1. Storage      → room / property photos (replaces base64-in-JSON)
//   2. Auth         → optional Google OAuth & email magic-link
//   3. Postgres     → reserved for the Phase-3 analytics warehouse
//
// If the env vars are absent the helpers fall back to PocketBase-only
// behaviour so the app keeps building locally without a Supabase project.
//
// Read SUPABASE_SETUP.md at the repo root for the one-time provisioning steps.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // After the Phase-3 cutover Supabase Auth is the primary identity
        // store, so persist the session in localStorage — this keeps the
        // user logged in across tabs and browser restarts.
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      global: { headers: { 'x-client': 'checksquare-web' } },
    })
  : null;

export const SUPABASE_PHOTO_BUCKET = 'inspection-photos';

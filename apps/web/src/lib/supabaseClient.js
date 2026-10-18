// Supabase is the only supported production backend.
//
// The app may still compile without deployment variables, but runtime data
// access must fail clearly instead of silently switching to another backend.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Persist the Supabase session so users remain logged in across tabs
        // and browser restarts.
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      global: { headers: { 'x-client': 'checksquare-web' } },
    })
  : null;

export const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
};

export const SUPABASE_PHOTO_BUCKET = 'inspection-photos';

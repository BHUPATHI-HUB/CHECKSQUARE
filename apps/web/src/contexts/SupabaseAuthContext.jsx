// Supabase Auth context — ADDITIVE.  PocketBase remains the authoritative
// identity store.  This context only powers the optional Google OAuth and
// email magic-link sign-in flows.
//
// Flow when a user signs in via Google:
//   1. supabase.auth.signInWithOAuth() opens the Google consent screen.
//   2. On callback, Supabase stores its own session in sessionStorage.
//   3. We read the verified email + name from Supabase and call the
//      `/api/supabase/oauth-bridge` PocketBase hook (see SUPABASE_SETUP.md
//      §5.4) which finds or creates the matching PB user and returns a PB
//      auth token, which we then load into the PB authStore.
//
// Net effect: the user signs in once with Google, but the existing
// PocketBase-based AuthContext + role checks keep working unchanged.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient.js';
import pb from '@/lib/pocketbaseClient.js';

const SupabaseAuthContext = createContext(null);

export const useSupabaseAuth = () => useContext(SupabaseAuthContext) || {
  supabaseEnabled: false,
  signInWithGoogle: async () => toast.error('Supabase Auth is not configured.'),
  signInWithMagicLink: async () => toast.error('Supabase Auth is not configured.'),
};

export const SupabaseAuthProvider = ({ children }) => {
  const [supabaseSession, setSupabaseSession] = useState(null);
  const [bridging, setBridging] = useState(false);

  // Listen for Supabase auth-state changes (OAuth callback, sign-out, etc.).
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSupabaseSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseSession(session);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // When a Supabase session appears and the PocketBase session is empty,
  // call the bridge to exchange it for a PB token.  Runs once per session.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!supabaseSession || pb.authStore.isValid || bridging) return;
    let cancelled = false;
    (async () => {
      setBridging(true);
      try {
        const accessToken = supabaseSession.access_token;
        const res = await pb.send('/api/supabase/oauth-bridge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { access_token: accessToken },
        });
        if (cancelled) return;
        // Bridge returns { token, record } shaped exactly like PB's
        // authWithPassword response — load it into the existing authStore.
        if (res?.token && res?.record) {
          pb.authStore.save(res.token, res.record);
          toast.success(`Signed in as ${res.record.email}`);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Supabase ↔ PocketBase bridge failed:', e);
          toast.error('Could not complete sign-in. Please try again or use email + password.');
          // Clear the dangling Supabase session so the user can retry cleanly.
          await supabase.auth.signOut();
        }
      } finally {
        if (!cancelled) setBridging(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabaseSession, bridging]);

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) {
      toast.error('Google sign-in is not configured. Use email & password.');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (error) toast.error(error.message);
  };

  const signInWithMagicLink = async (email) => {
    if (!isSupabaseConfigured) {
      toast.error('Magic-link sign-in is not configured.');
      return { success: false };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) {
      toast.error(error.message);
      return { success: false, error: error.message };
    }
    toast.success('Check your inbox for the sign-in link.');
    return { success: true };
  };

  const value = {
    supabaseEnabled: isSupabaseConfigured,
    supabaseSession,
    bridging,
    signInWithGoogle,
    signInWithMagicLink,
  };

  return (
    <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>
  );
};

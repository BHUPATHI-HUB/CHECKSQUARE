// Supabase Auth context for OAuth and email magic-link sign-in flows.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient.js';

const SupabaseAuthContext = createContext(null);

export const useSupabaseAuth = () => useContext(SupabaseAuthContext) || {
  supabaseEnabled: false,
  signInWithGoogle: async () => toast.error('Supabase Auth is not configured.'),
  signInWithMagicLink: async () => toast.error('Supabase Auth is not configured.'),
};

export const SupabaseAuthProvider = ({ children }) => {
  const [supabaseSession, setSupabaseSession] = useState(null);

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
    bridging: false,
    signInWithGoogle,
    signInWithMagicLink,
  };

  return (
    <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>
  );
};

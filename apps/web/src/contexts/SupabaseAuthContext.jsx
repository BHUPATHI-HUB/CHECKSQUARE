// Supabase Auth context for OAuth and email magic-link sign-in flows.

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient.js';
import { NATIVE_AUTH_CALLBACK, RECOVERY_PENDING_KEY, isRecoveryPending } from '@/lib/authRedirect.js';

const SupabaseAuthContext = createContext(null);

export const useSupabaseAuth = () => useContext(SupabaseAuthContext) || {
  supabaseEnabled: false,
  signInWithGoogle: async () => toast.error('Supabase Auth is not configured.'),
  signInWithMagicLink: async () => toast.error('Supabase Auth is not configured.'),
};

export const SupabaseAuthProvider = ({ children }) => {
  const [supabaseSession, setSupabaseSession] = useState(null);
  const handledCallbackUrls = useRef(new Set());

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

  // Google authentication runs in the system browser on Android. Return the
  // authorization code to this app through its registered deep link, then
  // exchange it in the WebView where Supabase stored the PKCE verifier.
  useEffect(() => {
    if (!isSupabaseConfigured || !Capacitor.isNativePlatform()) return;
    let mounted = true;
    let listener;

    const handleUrl = async ({ url }) => {
      if (!mounted || !url || handledCallbackUrls.current.has(url)) return;
      let callback;
      try {
        callback = new URL(url);
      } catch {
        return;
      }
      if (callback.protocol !== 'com.bhupathi.checksquare.connected:' || callback.hostname !== 'auth' || callback.pathname !== '/callback') return;
      handledCallbackUrls.current.add(url);

      try {
        const authError = callback.searchParams.get('error_description') || callback.searchParams.get('error');
        if (authError) throw new Error(authError);

        const code = callback.searchParams.get('code');
        if (!code) throw new Error('Google sign-in did not return an authorization code.');

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        await Browser.close().catch(() => {});
        if (isRecoveryPending()) {
          window.history.pushState(null, '', '/reset-password');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      } catch (error) {
        toast.error(error?.message || 'Could not complete Google sign-in.');
      }
    };

    const listenForCallback = async () => {
      listener = await App.addListener('appUrlOpen', handleUrl);
      const launch = await App.getLaunchUrl();
      if (launch?.url) await handleUrl({ url: launch.url });
    };

    listenForCallback().catch((error) => {
      if (mounted) toast.error(error?.message || 'Could not listen for the Google sign-in callback.');
    });

    return () => {
      mounted = false;
      listener?.remove();
    };
  }, []);


  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) {
      toast.error('Google sign-in is not configured. Use email & password.');
      return;
    }
    const native = Capacitor.isNativePlatform();
    try {
      if (native) {
        try { localStorage.removeItem(RECOVERY_PENDING_KEY); } catch { /* optional flag */ }
      }
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: native ? NATIVE_AUTH_CALLBACK : `${window.location.origin}/login`,
          ...(native ? { skipBrowserRedirect: true } : {}),
        },
      });
      if (error) throw error;
      if (native) {
        if (!data?.url) throw new Error('Supabase did not return a Google sign-in URL.');
        await Browser.open({ url: data.url });
      }
    } catch (error) {
      toast.error(error?.message || 'Could not start Google sign-in.');
    }
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

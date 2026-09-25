// Supabase Auth context for OAuth and email magic-link sign-in.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient.js';
import { IS_HYBRID_APK } from '@/lib/appTarget.js';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

const SupabaseAuthContext = createContext(null);
const NATIVE_CALLBACK_URL = 'com.bhupathi.checksquare://auth/callback';
const shouldUseNativeOAuth = () => IS_HYBRID_APK || Capacitor.isNativePlatform();

const parseHash = (hash) => {
  const out = {};
  const value = String(hash || '').replace(/^#/, '');
  for (const pair of value.split('&')) {
    if (!pair) continue;
    const [k, v] = pair.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return out;
};

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

  // Native OAuth callback handling (Android/iOS): when Google redirects back
  // to the app via deep link, exchange code/hash for a Supabase session.
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    if (!shouldUseNativeOAuth()) return undefined;

    let handleRef;
    const setup = async () => {
      handleRef = await CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
        if (!url || !url.startsWith('com.bhupathi.checksquare://')) return;
        try {
          await Browser.close().catch(() => {});
          const parsed = new URL(url);
          const code = parsed.searchParams.get('code');
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
            return;
          }

          const h = parseHash(parsed.hash || '');
          if (h.access_token && h.refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token: h.access_token,
              refresh_token: h.refresh_token,
            });
            if (error) throw error;
            return;
          }

          if (h.error_description || h.error) {
            toast.error(h.error_description || h.error);
          }
        } catch (e) {
          console.error('Native OAuth callback handling failed:', e);
          toast.error('Google sign-in callback failed. Please try again.');
        }
      });
    };
    setup();

    return () => {
      if (handleRef?.remove) handleRef.remove();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) {
      toast.error('Google sign-in is not configured. Use email & password.');
      return;
    }

    const redirectTo = shouldUseNativeOAuth()
      ? NATIVE_CALLBACK_URL
      : `${window.location.origin}/login`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: shouldUseNativeOAuth() },
    });
    if (error) {
      toast.error(error.message);
      return;
    }

    if (shouldUseNativeOAuth()) {
      if (!data?.url) {
        toast.error('Could not start Google sign-in.');
        return;
      }
      await Browser.open({ url: data.url, presentationStyle: 'fullscreen' });
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
    signInWithGoogle,
    signInWithMagicLink,
  };

  return (
    <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>
  );
};

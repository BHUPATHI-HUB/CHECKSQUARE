import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { isDemoMode, getDemoUser } from '@/lib/previewMode.js';
import { supabase } from '@/lib/supabaseClient.js';

const AuthContext = createContext(null);
// Supabase Auth is the only supported production identity provider.

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

const toSupabaseUserSession = (authUser, profile) => {
  if (!authUser) return null;
  const meta = authUser.user_metadata || {};
  return {
    id: authUser.id,
    email: profile?.email || authUser.email,
    name: profile?.name || meta.full_name || meta.name || authUser.email,
    role: profile?.role || 'customer',
    phone: profile?.phone || meta.phone || '',
    address: profile?.address || meta.address || '',
  };
};

const decodeJwtExp = (token) => {
  if (!token) return null;
  try {
    let b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(b64));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [supabaseSession, setSupabaseSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionWarning, setSessionWarning] = useState(false);
  const warnedRef = useRef(false);

  const loadSupabaseUser = useCallback(async (authUser) => {
    if (!authUser) return null;
    try {
      if (navigator.onLine === false) {
        const cached = JSON.parse(localStorage.getItem(`profile:${authUser.id}`) || 'null');
        return cached?.id === authUser.id ? cached : null;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,name,role,phone,address')
        .eq('id', authUser.id)
        .maybeSingle();
      if (error || !data) {
        console.error('Supabase profile unavailable; refusing to create a role-less session.', error || 'profile not found');
        return null;
      }
      const profile = toSupabaseUserSession(authUser, data);
      try { localStorage.setItem(`profile:${authUser.id}`, JSON.stringify(profile)); } catch { /* optional cache */ }
      return profile;
    } catch {
      return null;
    }
  }, []);

  const logout = useCallback(() => {
    supabase?.auth.signOut().catch(() => {});
    setSupabaseSession(null);
    setUser(null);
    setSessionWarning(false);
    warnedRef.current = false;
  }, []);

  useEffect(() => {
    let mounted = true;

    if (isDemoMode) {
      setUser(getDemoUser());
      setSupabaseSession({ user: getDemoUser() });
      setLoading(false);
      return () => { mounted = false; };
    }
    if (!supabase) {
      setLoading(false);
      return () => { mounted = false; };
    }

    let authRevision = 0;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const revision = ++authRevision;
      setSupabaseSession(session || null);
      if (!session?.user) {
        setUser(null);
        setLoading(false);
        return;
      }
      setUser((previous) => previous?.id === session.user.id ? previous : null);
      // Supabase auth holds a lock in this callback. Defer SDK calls.
      setTimeout(async () => {
        const nextUser = await loadSupabaseUser(session.user);
        if (mounted && revision === authRevision) { setUser(nextUser); setLoading(false); }
      }, 0);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadSupabaseUser]);

  // ---------------------------------------------------------------------------
  // Inactivity guard (Spec §1 / DoD #3)
  //   - At 29 minutes of zero user interaction -> show countdown modal.
  //   - At 30 minutes -> hard logout + redirect.
  // Activity = mousemove / keydown / touchstart / scroll / click anywhere.
  // ---------------------------------------------------------------------------
  const IDLE_WARN_MS = 29 * 60 * 1000;
  const IDLE_LOGOUT_MS = 30 * 60 * 1000;
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!user) return;

    // Single tick. Reads activity via ref + reads warning state via a flag ref
    // so that toggling the modal does NOT re-mount listeners or restart the
    // interval (previous behaviour re-added 5 listeners every modal toggle).
    const bump = () => { lastActivityRef.current = Date.now(); };
    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));

    const tick = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_LOGOUT_MS) {
        toast.error('Signed out after 30 minutes of inactivity.');
        logout();
      } else if (idle >= IDLE_WARN_MS && !warnedRef.current) {
        warnedRef.current = true;
        setSessionWarning(true);
      } else if (idle < IDLE_WARN_MS && warnedRef.current) {
        // Activity resumed before logout -> auto-dismiss the modal.
        warnedRef.current = false;
        setSessionWarning(false);
      }
    }, 10 * 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, bump));
      clearInterval(tick);
    };
  }, [user, logout]);

  useEffect(() => {
    const token = supabaseSession?.access_token;
    if (!token) return;

    const interval = setInterval(() => {
      const exp = decodeJwtExp(token);
      if (!exp) return;
      const timeLeft = exp - Date.now();

      if (timeLeft <= 0) {
        toast.error('Session expired. Please log in again.');
        logout();
      } else if (timeLeft <= 5 * 60 * 1000 && !warnedRef.current) {
        warnedRef.current = true;
        setSessionWarning(true);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [user, logout, supabaseSession]);

  const extendSession = useCallback(async () => {
    if (!supabase) {
      toast.error('Supabase is not configured.');
      return;
    }
    {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        toast.error('Could not extend session. Please log in again.');
        logout();
        return;
      }
      setSupabaseSession(data.session || null);
      if (data.session?.user) {
        const nextUser = await loadSupabaseUser(data.session.user);
        setUser(nextUser);
      }
      warnedRef.current = false;
      setSessionWarning(false);
      lastActivityRef.current = Date.now();
      toast.success('Session extended successfully.');
      return;
    }
  }, [logout, loadSupabaseUser]);

  // `expectedRole` is accepted for backwards compatibility with the existing
  // login form; the authoritative role lives in the `users.role` field.
  const login = async (email, password, expectedRole) => {
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        setSupabaseSession(data.session || null);
        const nextUser = await loadSupabaseUser(data.user);
        setUser(nextUser);

        if (!nextUser) throw new Error('Your profile could not be loaded. Please reconnect and try again.');
        if (expectedRole && nextUser?.role !== expectedRole) {
          await supabase.auth.signOut();
          setSupabaseSession(null);
          setUser(null);
          return {
            success: false,
            error: `This account is not registered as a ${expectedRole}.`,
          };
        }
        return { success: true };
      } catch (e) {
        return {
          success: false,
          error: e?.message || 'Invalid email or password.',
        };
      }
    }
    return { success: false, error: 'Supabase is not configured.' };
  };

  const signup = async (userData) => {
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: userData.email,
          password: userData.password,
          options: {
            data: {
              full_name: userData.name,
              role: 'customer',
              phone: userData.phone || '',
              address: userData.address || '',
            },
          },
        });
        if (error) throw error;

        if (data.session && data.user) {
          const { error: profileError } = await supabase.from('profiles').update({
            phone: userData.phone || '', address: userData.address || '',
          }).eq('id', data.user.id);
          if (profileError) throw new Error('Account created, but contact details could not be saved.');
        }

        if (!data.session) {
          const signedIn = await supabase.auth.signInWithPassword({
            email: userData.email,
            password: userData.password,
          });
          if (!signedIn.error) {
            setSupabaseSession(signedIn.data.session || null);
            const nextUser = await loadSupabaseUser(signedIn.data.user);
            setUser(nextUser);
          }
        } else {
          setSupabaseSession(data.session);
          const nextUser = await loadSupabaseUser(data.user);
          setUser(nextUser);
        }

        return { success: true };
      } catch (e) {
        return { success: false, error: e?.message || 'Could not create account.' };
      }
    }
    return { success: false, error: 'Supabase is not configured.' };
  };

  const requestPasswordReset = async (email) => {
    if (supabase) {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) throw error;
        return { success: true };
      } catch (e) {
        return { success: false, error: e?.message || 'Could not send reset email.' };
      }
    }
    return { success: false, error: 'Supabase is not configured.' };
  };

  const hasRole = (requiredRole) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.role === requiredRole;
  };

  const value = {
    user,
    role: user?.role,
    loading,
    sessionWarning,
    login,
    signup,
    logout,
    extendSession,
    requestPasswordReset,
    hasRole,
    isAuthenticated: !!user && !!supabaseSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient.js';
import { IS_OFFLINE_ADMIN, OFFLINE_ADMIN_USER } from '@/lib/appTarget.js';

const AuthContext = createContext(null);
const USE_SUPABASE_AUTH = isSupabaseConfigured && (import.meta.env?.VITE_USE_SUPABASE_AUTH === 'true');
const OFFLINE_CACHE_KEY = 'auth-offline-cache-v1';
const OFFLINE_SESSION_KEY = 'auth-offline-session-v1';
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MS = 5 * 60 * 1000;

const readJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore localStorage quota/private mode errors.
  }
};

const makeCacheKey = (email, role) => `${String(role || '').toLowerCase()}::${String(email || '').toLowerCase()}`;

const isNetworkIssue = (err) => {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('fetch');
};

const randomSalt = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

const sha256Hex = async (text) => {
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Shape a PocketBase auth record into the simple `user` object the rest of the
// app already expects (id, email, name, role, phone, address).
const toUserSession = (record) => {
  if (!record) return null;
  return {
    id: record.id,
    email: record.email,
    name: record.name || record.email,
    role: record.role,
    phone: record.phone || '',
    address: record.address || '',
  };
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

const CloudAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [supabaseSession, setSupabaseSession] = useState(null);
  const [pbToken, setPbToken] = useState(null);
  const [sessionMode, setSessionMode] = useState('none');
  const [loading, setLoading] = useState(true);
  const [sessionWarning, setSessionWarning] = useState(false);
  const warnedRef = useRef(false);
  const pbRef = useRef(null);

  const getPB = useCallback(async () => {
    if (pbRef.current) return pbRef.current;
    const mod = await import('@/lib/pocketbaseClient.js');
    pbRef.current = mod.default;
    return pbRef.current;
  }, []);

  const loadSupabaseUser = useCallback(async (authUser) => {
    if (!authUser) return null;
    let profile = null;
    // During early migration the profiles table may not exist yet.
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,name,role,phone,address')
        .eq('id', authUser.id)
        .maybeSingle();
      if (!error) profile = data;
    } catch {
      // Ignore and fall back to auth metadata.
    }
    return toSupabaseUserSession(authUser, profile);
  }, []);

  const getCachedUsersByRole = useCallback((role) => {
    const cache = readJSON(OFFLINE_CACHE_KEY, { users: {} });
    const roleNorm = String(role || '').toLowerCase();
    return Object.values(cache.users || {})
      .filter((u) => !roleNorm || String(u.role || '').toLowerCase() === roleNorm)
      .map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, lastLoginAt: u.lastLoginAt }));
  }, []);

  const cacheOfflineIdentity = useCallback(async (sessionUser, pinSeed) => {
    if (!sessionUser?.email || !sessionUser?.role || !pinSeed) return;
    const cache = readJSON(OFFLINE_CACHE_KEY, { users: {} });
    const key = makeCacheKey(sessionUser.email, sessionUser.role);
    const salt = randomSalt();
    const pinHash = await sha256Hex(`${salt}:${pinSeed}`);
    cache.users[key] = {
      id: sessionUser.id,
      email: sessionUser.email,
      name: sessionUser.name || sessionUser.email,
      role: sessionUser.role,
      phone: sessionUser.phone || '',
      address: sessionUser.address || '',
      pinSalt: salt,
      pinHash,
      failedAttempts: 0,
      lockUntil: null,
      lastLoginAt: new Date().toISOString(),
    };
    writeJSON(OFFLINE_CACHE_KEY, cache);
  }, []);

  const loginOfflineWithPin = useCallback(async (email, pin, expectedRole) => {
    const role = expectedRole || 'customer';
    const key = makeCacheKey(email, role);
    const cache = readJSON(OFFLINE_CACHE_KEY, { users: {} });
    const entry = cache.users?.[key];
    if (!entry) {
      return { success: false, error: `No cached ${role} account found for offline login.` };
    }

    const now = Date.now();
    if (entry.lockUntil && now < entry.lockUntil) {
      const mins = Math.max(1, Math.ceil((entry.lockUntil - now) / 60000));
      return { success: false, error: `Offline PIN locked. Try again in ${mins} minute(s).` };
    }

    const hash = await sha256Hex(`${entry.pinSalt}:${pin}`);
    if (hash !== entry.pinHash) {
      const nextFails = (entry.failedAttempts || 0) + 1;
      entry.failedAttempts = nextFails;
      if (nextFails >= PIN_MAX_ATTEMPTS) {
        entry.lockUntil = Date.now() + PIN_LOCK_MS;
        entry.failedAttempts = 0;
      }
      cache.users[key] = entry;
      writeJSON(OFFLINE_CACHE_KEY, cache);
      return { success: false, error: 'Invalid offline PIN.' };
    }

    entry.failedAttempts = 0;
    entry.lockUntil = null;
    entry.lastLoginAt = new Date().toISOString();
    cache.users[key] = entry;
    writeJSON(OFFLINE_CACHE_KEY, cache);

    const offlineUser = {
      id: entry.id,
      email: entry.email,
      name: entry.name,
      role: entry.role,
      phone: entry.phone || '',
      address: entry.address || '',
    };

    setSupabaseSession(null);
    setPbToken(null);
    setUser(offlineUser);
    setSessionMode('offline-auth');
    writeJSON(OFFLINE_SESSION_KEY, { mode: 'offline-auth', user: offlineUser, at: new Date().toISOString() });
    return { success: true, offline: true };
  }, []);

  const logout = useCallback(() => {
    if (USE_SUPABASE_AUTH) {
      supabase.auth.signOut().catch(() => {});
      setSupabaseSession(null);
    } else if (pbRef.current) {
      pbRef.current.authStore.clear();
    } else {
      getPB().then((pb) => pb.authStore.clear()).catch(() => {});
    }
    setPbToken(null);
    setUser(null);
    setSessionMode('none');
    setSessionWarning(false);
    warnedRef.current = false;
    localStorage.removeItem(OFFLINE_SESSION_KEY);
  }, [getPB]);

  // Subscribe to PocketBase auth changes so multiple tabs stay in sync and a
  // refresh of the auth record automatically propagates.
  useEffect(() => {
    if (USE_SUPABASE_AUTH) {
      let mounted = true;

      const init = async () => {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSupabaseSession(data.session || null);
        if (data.session?.user) {
          const nextUser = await loadSupabaseUser(data.session.user);
          if (mounted) {
            setUser(nextUser);
            setSessionMode('online-auth');
          }
        } else {
          const offlineSession = readJSON(OFFLINE_SESSION_KEY, null);
          if (offlineSession?.mode === 'offline-auth' && offlineSession?.user) {
            setUser(offlineSession.user);
            setSessionMode('offline-auth');
          } else {
            setUser(null);
            setSessionMode('none');
          }
        }
        setLoading(false);
      };
      init();

      const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
        setSupabaseSession(session || null);
        if (!session?.user) {
          const offlineSession = readJSON(OFFLINE_SESSION_KEY, null);
          if (offlineSession?.mode === 'offline-auth' && offlineSession?.user) {
            setUser(offlineSession.user);
            setSessionMode('offline-auth');
          } else {
            setUser(null);
            setSessionMode('none');
          }
          return;
        }
        const nextUser = await loadSupabaseUser(session.user);
        if (mounted) {
          setUser(nextUser);
          setSessionMode('online-auth');
        }
      });

      return () => {
        mounted = false;
        sub.subscription.unsubscribe();
      };
    }

    let cancelled = false;
    let unsubscribe = () => {};

    const initPb = async () => {
      try {
        const pb = await getPB();
        if (cancelled) return;

        unsubscribe = pb.authStore.onChange(() => {
          setUser(toUserSession(pb.authStore.record));
          setPbToken(pb.authStore.token || null);
        }, true);

        // Initial validation: if a token is stored, refresh it once so an expired
        // session is cleared cleanly on first load.
        if (pb.authStore.isValid) {
          try {
            await pb.collection('users').authRefresh();
          } catch (e) {
            pb.authStore.clear();
          }
        }

        if (cancelled) return;
        const nextUser = toUserSession(pb.authStore.record);
        setUser(nextUser);
        setPbToken(pb.authStore.token || null);
        setSessionMode(nextUser ? 'online-auth' : 'none');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    initPb();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadSupabaseUser, getPB]);

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

  // Session expiry warning. PocketBase tokens are JWTs; decode the `exp` claim.
  useEffect(() => {
    const token = USE_SUPABASE_AUTH ? supabaseSession?.access_token : pbToken;
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
  }, [user, logout, supabaseSession, pbToken]);

  const extendSession = useCallback(async () => {
    if (USE_SUPABASE_AUTH) {
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

    try {
      const pb = await getPB();
      await pb.collection('users').authRefresh();
      setUser(toUserSession(pb.authStore.record));
      setPbToken(pb.authStore.token || null);
      warnedRef.current = false;
      setSessionWarning(false);
      lastActivityRef.current = Date.now();
      toast.success('Session extended successfully.');
    } catch (e) {
      toast.error('Could not extend session. Please log in again.');
      logout();
    }
  }, [logout, loadSupabaseUser, getPB]);

  // `expectedRole` is accepted for backwards compatibility with the existing
  // login form; the authoritative role lives in the `users.role` field.
  const login = async (email, password, expectedRole) => {
    if (USE_SUPABASE_AUTH) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        setSupabaseSession(data.session || null);
        const nextUser = await loadSupabaseUser(data.user);
        setUser(nextUser);
        setSessionMode('online-auth');

        if (expectedRole && nextUser?.role !== expectedRole) {
          await supabase.auth.signOut();
          setSupabaseSession(null);
          setUser(null);
          setSessionMode('none');
          return {
            success: false,
            error: `This account is not registered as a ${expectedRole}.`,
          };
        }
        await cacheOfflineIdentity(nextUser, password);
        localStorage.removeItem(OFFLINE_SESSION_KEY);
        return { success: true };
      } catch (e) {
        if ((typeof navigator !== 'undefined' && !navigator.onLine) || isNetworkIssue(e)) {
          return loginOfflineWithPin(email, password, expectedRole);
        }
        return {
          success: false,
          error: e?.message || 'Invalid email or password.',
        };
      }
    }

    try {
      const pb = await getPB();
      const authData = await pb
        .collection('users')
        .authWithPassword(email, password);

      if (expectedRole && authData.record.role !== expectedRole) {
        pb.authStore.clear();
        setPbToken(null);
        setUser(null);
        return {
          success: false,
          error: `This account is not registered as a ${expectedRole}.`,
        };
      }

      setUser(toUserSession(pb.authStore.record));
      setPbToken(pb.authStore.token || null);
      setSessionMode('online-auth');

      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e?.message || 'Invalid email or password.',
      };
    }
  };

  const signup = async (userData) => {
    if (USE_SUPABASE_AUTH) {
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

        if (data.user) {
          try {
            await supabase.from('profiles').upsert({
              id: data.user.id,
              email: data.user.email,
              name: userData.name,
              role: 'customer',
              phone: userData.phone || '',
              address: userData.address || '',
            }, { onConflict: 'id' });
          } catch {
            // Safe to ignore until profiles table exists everywhere.
          }
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

    try {
      const pb = await getPB();
      const payload = {
        email: userData.email,
        password: userData.password,
        passwordConfirm: userData.password,
        name: userData.name,
        phone: userData.phone || '',
        address: userData.address || '',
        // Public signup is always a customer; admins/inspectors are provisioned
        // via the PocketBase admin UI.
        role: 'customer',
        emailVisibility: true,
      };

      await pb.collection('users').create(payload);
      await pb.collection('users').authWithPassword(userData.email, userData.password);
      setUser(toUserSession(pb.authStore.record));
      setPbToken(pb.authStore.token || null);

      return { success: true };
    } catch (e) {
      const msg =
        e?.data?.data?.email?.message ||
        e?.message ||
        'Could not create account.';
      return { success: false, error: msg };
    }
  };

  const requestPasswordReset = async (email) => {
    if (USE_SUPABASE_AUTH) {
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

    try {
      const pb = await getPB();
      await pb.collection('users').requestPasswordReset(email);
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || 'Could not send reset email.' };
    }
  };

  const hasRole = (requiredRole) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.role === requiredRole;
  };

  const value = {
    user,
    role: user?.role,
    sessionMode,
    loading,
    sessionWarning,
    login,
    loginOfflineWithPin,
    getCachedUsersByRole,
    signup,
    logout,
    extendSession,
    requestPasswordReset,
    hasRole,
    isAuthenticated: USE_SUPABASE_AUTH
      ? (!!user && (!!supabaseSession || sessionMode === 'offline-auth'))
      : (!!user && !!pbToken),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Public provider — swaps in a static, network-free identity for the
// offline-admin Android build, otherwise runs the full cloud auth stack.
// Split into two components so React Hooks are never called conditionally.
export const AuthProvider = ({ children }) => {
  if (IS_OFFLINE_ADMIN) {
    const offlineValue = {
      user: OFFLINE_ADMIN_USER,
      role: OFFLINE_ADMIN_USER.role,
      sessionMode: 'offline-auth',
      loading: false,
      sessionWarning: false,
      login: async () => ({ success: true }),
      loginOfflineWithPin: async () => ({ success: true, offline: true }),
      getCachedUsersByRole: () => [OFFLINE_ADMIN_USER],
      signup: async () => ({ success: true }),
      logout: () => {},
      extendSession: async () => {},
      requestPasswordReset: async () => ({ success: true }),
      hasRole: () => true,
      isAuthenticated: true,
    };
    return <AuthContext.Provider value={offlineValue}>{children}</AuthContext.Provider>;
  }
  return <CloudAuthProvider>{children}</CloudAuthProvider>;
};

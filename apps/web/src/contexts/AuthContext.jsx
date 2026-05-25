import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

const AuthContext = createContext(null);

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

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(toUserSession(pb.authStore.record));
  const [loading, setLoading] = useState(true);
  const [sessionWarning, setSessionWarning] = useState(false);
  const warnedRef = useRef(false);

  const logout = useCallback(() => {
    pb.authStore.clear();
    setUser(null);
    setSessionWarning(false);
    warnedRef.current = false;
  }, []);

  // Subscribe to PocketBase auth changes so multiple tabs stay in sync and a
  // refresh of the auth record automatically propagates.
  useEffect(() => {
    const unsubscribe = pb.authStore.onChange(() => {
      setUser(toUserSession(pb.authStore.record));
    }, true);

    // Initial validation: if a token is stored, refresh it once so an expired
    // session is cleared cleanly on first load.
    const init = async () => {
      if (pb.authStore.isValid) {
        try {
          await pb.collection('users').authRefresh();
        } catch (e) {
          pb.authStore.clear();
        }
      }
      setLoading(false);
    };
    init();

    return () => unsubscribe();
  }, []);

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
    if (!pb.authStore.token) return;

    const decodeExp = (token) => {
      try {
        // JWTs use base64url (URL-safe alphabet) which atob() can't parse
        // directly — translate `-_` → `+/` and right-pad to a multiple of 4.
        let b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        b64 += '='.repeat((4 - (b64.length % 4)) % 4);
        const payload = JSON.parse(atob(b64));
        return payload.exp ? payload.exp * 1000 : null;
      } catch {
        return null;
      }
    };

    const interval = setInterval(() => {
      const exp = decodeExp(pb.authStore.token);
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
  }, [user, logout]);

  const extendSession = useCallback(async () => {
    try {
      await pb.collection('users').authRefresh();
      warnedRef.current = false;
      setSessionWarning(false);
      lastActivityRef.current = Date.now();
      toast.success('Session extended successfully.');
    } catch (e) {
      toast.error('Could not extend session. Please log in again.');
      logout();
    }
  }, [logout]);

  // `expectedRole` is accepted for backwards compatibility with the existing
  // login form; the authoritative role lives in the `users.role` field.
  const login = async (email, password, expectedRole) => {
    try {
      const authData = await pb
        .collection('users')
        .authWithPassword(email, password);

      if (expectedRole && authData.record.role !== expectedRole) {
        pb.authStore.clear();
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
  };

  const signup = async (userData) => {
    try {
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
    try {
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
    loading,
    sessionWarning,
    login,
    signup,
    logout,
    extendSession,
    requestPasswordReset,
    hasRole,
    isAuthenticated: !!user && pb.authStore.isValid,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

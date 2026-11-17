import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch, setAuthToken } from '../lib/api';
import type { AppUser } from '../types/marketplace';

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInSandboxPersona: (role: 'customer' | 'restaurant_owner' | 'rider' | 'super_admin') => Promise<AppUser>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const syncFirebaseUser = useCallback(async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    const idToken = await fbUser.getIdToken();
    setAuthToken(idToken);
    const res = await apiFetch<{ user: AppUser }>('/api/auth/sync', { method: 'POST' });
    setUser(res.user);
  }, []);

  useEffect(() => {
    let mounted = true;
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!mounted) return;
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          setAuthToken(idToken);
          const res = await apiFetch<{ user: AppUser }>('/api/auth/sync', { method: 'POST' });
          if (mounted) setUser(res.user);
        } catch (err) {
          console.error('Firebase user sync failed:', err);
        } finally {
          if (mounted) setLoading(false);
        }
      } else {
        // Auto-initialize default Customer sandbox session if not signed into Firebase,
        // or wait if user explicitly signed out.
        try {
          const res = await apiFetch<{ token: string; user: AppUser }>('/api/auth/sandbox-session', {
            method: 'POST',
            body: JSON.stringify({ role: 'customer' }),
          });
          setAuthToken(res.token);
          if (mounted) setUser(res.user);
        } catch {
          if (mounted) setUser(null);
        } finally {
          if (mounted) setLoading(false);
        }
      }
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
      await syncFirebaseUser();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed';
      setError(msg);
      throw err;
    }
  }, [syncFirebaseUser]);

  const signInSandboxPersona = useCallback(
    async (role: 'customer' | 'restaurant_owner' | 'rider' | 'super_admin') => {
      setError(null);
      const res = await apiFetch<{ token: string; user: AppUser }>('/api/auth/sandbox-session', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      setAuthToken(res.token);
      setUser(res.user);
      return res.user;
    },
    []
  );

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    if (auth.currentUser) {
      await fbSignOut(auth);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await apiFetch<{ user: AppUser }>('/api/auth/sync', { method: 'POST' });
    setUser(res.user);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signInWithGoogle,
        signInSandboxPersona,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

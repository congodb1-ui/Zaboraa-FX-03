import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { fetchAuthConfig, getSupabaseClient } from '../services/supabaseClient';

export interface UserProfile {
  userId: string;
  email: string;
  role: string;
  status: string;
  permissions: string[];
  aal?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: string;
  effectiveRole: string;
  previewRole: string | null;
  setPreviewRole: (role: string | null) => void;
  permissions: string[];
  hasPermission: (perm: string) => boolean;
  isConfigured: boolean;
  isLoading: boolean;
  sessionExpired: boolean;
  setSessionExpired: (val: boolean) => void;
  signInWithPassword: (email: string, pass: string) => Promise<{ error?: string }>;
  signInWithOtp: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  master_admin: [
    'research.view',
    'backtest.run',
    'strategy.edit',
    'bot.start_stop',
    'order.place_demo',
    'order.place_live',
    'account.view',
    'account.manage',
    'firewall.view',
    'firewall.edit',
    'user.manage',
    'audit.view',
    'settings.edit',
    'kill.engage',
  ],
  admin: [
    'research.view',
    'backtest.run',
    'strategy.edit',
    'bot.start_stop',
    'order.place_demo',
    'order.place_live',
    'account.view',
    'account.manage',
    'firewall.view',
    'firewall.edit',
    'user.manage',
    'audit.view',
    'kill.engage',
  ],
  trader: [
    'research.view',
    'backtest.run',
    'strategy.edit',
    'bot.start_stop',
    'order.place_demo',
    'account.view',
    'firewall.view',
  ],
  viewer: ['research.view', 'account.view', 'audit.view'],
  pending: [],
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [previewRole, setPreviewRole] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  // Initialize Auth state from runtime endpoint
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      const config = await fetchAuthConfig();
      if (!isMounted) return;

      if (!config.configured) {
        setIsConfigured(false);
        setIsLoading(false);
        return;
      }

      setIsConfigured(true);
      const supabase = getSupabaseClient();
      if (!supabase) {
        setIsLoading(false);
        return;
      }

      // Check current session
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      if (initialSession) {
        setSession(initialSession);
        setUser(initialSession.user);
        await loadUserProfile(initialSession.access_token);
      }

      // Listen for auth changes
      const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (!isMounted) return;
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          setPreviewRole(null);
        } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
          if (newSession) {
            setSession(newSession);
            setUser(newSession.user);
            setSessionExpired(false);
            await loadUserProfile(newSession.access_token);
          }
        }
      });

      setIsLoading(false);
      return () => {
        authListener?.subscription.unsubscribe();
      };
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const loadUserProfile = async (token: string) => {
    try {
      const res = await fetch('/api/admin/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      } else if (res.status === 401) {
        setSessionExpired(true);
      }
    } catch (err) {
      console.warn('Failed to fetch profile:', err);
    }
  };

  const signInWithPassword = async (email: string, pass: string): Promise<{ error?: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: 'Authentication is not configured' };

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (error) return { error: error.message };

    if (data.session) {
      setSession(data.session);
      setUser(data.user);
      await loadUserProfile(data.session.access_token);
    }

    return {};
  };

  const signInWithOtp = async (email: string): Promise<{ error?: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: 'Authentication is not configured' };

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) return { error: error.message };
    return {};
  };

  const signOut = async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setUser(null);
    setProfile(null);
    setPreviewRole(null);
  };

  const getAccessToken = useCallback((): string | null => {
    return session?.access_token || null;
  }, [session]);

  const role = profile?.role || 'viewer';

  // Only Master Admin can preview as other roles (simulation only)
  const effectiveRole = useMemo(() => {
    if (role === 'master_admin' && previewRole) {
      return previewRole;
    }
    return role;
  }, [role, previewRole]);

  const permissions = useMemo(() => {
    if (profile?.permissions && profile.permissions.length > 0) {
      return profile.permissions;
    }
    return DEFAULT_ROLE_PERMISSIONS[effectiveRole] || [];
  }, [profile, effectiveRole]);

  const hasPermission = useCallback(
    (perm: string): boolean => {
      if (effectiveRole === 'master_admin') return true;
      return permissions.includes(perm);
    },
    [effectiveRole, permissions]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        effectiveRole,
        previewRole,
        setPreviewRole,
        permissions,
        hasPermission,
        isConfigured,
        isLoading,
        sessionExpired,
        setSessionExpired,
        signInWithPassword,
        signInWithOtp,
        signOut,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

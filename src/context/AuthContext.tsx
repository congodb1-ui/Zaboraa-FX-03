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
  isPublic: boolean;
  sessionExpired: boolean;
  setSessionExpired: (val: boolean) => void;
  signInWithPassword: (email: string, pass: string) => Promise<{ error?: string }>;
  signInWithOtp: (email: string) => Promise<{ error?: string }>;
  signInWithLocalAccount: (email: string, role: string) => Promise<{ error?: string }>;
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

  // Initialize Auth state from runtime endpoint or saved session
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      // 1. Check local session cache first
      try {
        const cached = localStorage.getItem('zaboraa_local_session');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.email && parsed.role) {
            const localUser = {
              id: 'local-' + parsed.role,
              email: parsed.email,
              app_metadata: {},
              user_metadata: {},
              aud: 'authenticated',
              created_at: new Date().toISOString(),
            } as unknown as User;

            const localProfile: UserProfile = {
              userId: localUser.id,
              email: parsed.email,
              role: parsed.role,
              status: 'active',
              permissions: DEFAULT_ROLE_PERMISSIONS[parsed.role] || [],
              aal: parsed.role === 'master_admin' || parsed.role === 'admin' ? 'aal2' : 'aal1',
            };

            setUser(localUser);
            setProfile(localProfile);
          }
        }
      } catch {}

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

      // Check current Supabase session
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

  const signInWithLocalAccount = async (email: string, targetRole: string): Promise<{ error?: string }> => {
    const validRoles = ['master_admin', 'admin', 'trader', 'viewer'];
    const assignedRole = validRoles.includes(targetRole) ? targetRole : 'trader';
    const localUser = {
      id: 'local-' + assignedRole + '-' + Date.now().toString(36),
      email,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as unknown as User;

    const localProfile: UserProfile = {
      userId: localUser.id,
      email,
      role: assignedRole,
      status: 'active',
      permissions: DEFAULT_ROLE_PERMISSIONS[assignedRole] || [],
      aal: assignedRole === 'master_admin' || assignedRole === 'admin' ? 'aal2' : 'aal1',
    };

    setUser(localUser);
    setProfile(localProfile);
    setSessionExpired(false);
    try {
      localStorage.setItem('zaboraa_local_session', JSON.stringify({ email, role: assignedRole }));
    } catch {}
    return {};
  };

  const signInWithPassword = async (email: string, pass: string): Promise<{ error?: string }> => {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });

      if (!error && data.session) {
        setSession(data.session);
        setUser(data.user);
        await loadUserProfile(data.session.access_token);
        return {};
      }
      if (error && isConfigured) {
        return { error: error.message };
      }
    }

    // Local / Demo password sign-in fallback
    const lower = email.toLowerCase();
    let deducedRole = 'trader';
    if (lower.includes('master') || lower === 'master_admin@zaboraa.com') {
      deducedRole = 'master_admin';
    } else if (lower.includes('admin') || lower === 'admin@zaboraa.com') {
      deducedRole = 'admin';
    } else if (lower.includes('viewer') || lower === 'viewer@zaboraa.com') {
      deducedRole = 'viewer';
    }
    return signInWithLocalAccount(email, deducedRole);
  };

  const signInWithOtp = async (email: string): Promise<{ error?: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      // Local fallback for OTP
      return signInWithLocalAccount(email, 'trader');
    }

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
      try {
        await supabase.auth.signOut();
      } catch {}
    }
    try {
      localStorage.removeItem('zaboraa_local_session');
    } catch {}
    setSession(null);
    setUser(null);
    setProfile(null);
    setPreviewRole(null);
  };

  const getAccessToken = useCallback((): string | null => {
    return session?.access_token || null;
  }, [session]);

  const isPublic = !user;
  const role = user ? (profile?.role || 'trader') : 'public';

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
      if (!user) return false;
      if (effectiveRole === 'master_admin') return true;
      return permissions.includes(perm);
    },
    [user, effectiveRole, permissions]
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
        isPublic,
        sessionExpired,
        setSessionExpired,
        signInWithPassword,
        signInWithOtp,
        signInWithLocalAccount,
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

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { fetchAuthConfig, getSupabaseClient } from '../services/supabaseClient';

export interface UserProfile {
  userId: string;
  email: string;
  name?: string;
  role: string;
  status: string;
  department?: string;
  deskId?: string;
  permissions: string[];
  aal?: string;
  createdAt?: string;
  lastLoginAt?: string;
  assignedAccounts?: string[];
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
  signInWithCredentials: (
    email: string,
    pass: string,
    mfaCode?: string,
    rememberMe?: boolean
  ) => Promise<{ error?: string; mfaRequired?: boolean }>;
  signInWithPassword: (
    email: string,
    pass: string,
    mfaCode?: string,
    rememberMe?: boolean
  ) => Promise<{ error?: string; mfaRequired?: boolean }>;
  registerAccount: (params: {
    email: string;
    password: string;
    name: string;
    role?: string;
    department?: string;
    deskId?: string;
  }) => Promise<{ error?: string }>;
  updateProfile: (data: {
    name?: string;
    department?: string;
    deskId?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => Promise<{ success: boolean; error?: string }>;
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
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('zaboraa_auth_token') || null;
    } catch {
      return null;
    }
  });
  const [previewRole, setPreviewRole] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  // Initialize Auth state from runtime endpoint or saved session
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      // 1. Verify saved enterprise token with backend SQLite session store
      try {
        const savedToken = localStorage.getItem('zaboraa_auth_token');
        if (savedToken) {
          const res = await fetch('/api/auth/me', {
            headers: {
              Authorization: `Bearer ${savedToken}`,
            },
          });
          if (res.ok) {
            const data = await res.json();
            const authedUser = {
              id: data.userId,
              email: data.email,
              app_metadata: {},
              user_metadata: { name: data.name },
              aud: 'authenticated',
              created_at: new Date().toISOString(),
            } as unknown as User;

            const authedProfile: UserProfile = {
              userId: data.userId,
              email: data.email,
              name: data.name,
              role: data.role,
              status: data.status,
              department: data.department,
              deskId: data.deskId,
              createdAt: data.createdAt,
              lastLoginAt: data.lastLoginAt,
              assignedAccounts: data.assignedAccounts || [],
              permissions: data.permissions || DEFAULT_ROLE_PERMISSIONS[data.role] || [],
              aal: data.aal || 'aal1',
            };

            if (isMounted) {
              setUser(authedUser);
              setProfile(authedProfile);
              setAuthToken(savedToken);
              setIsLoading(false);
              return;
            }
          } else {
            // Token expired or invalid
            localStorage.removeItem('zaboraa_auth_token');
            if (isMounted) setAuthToken(null);
          }
        }
      } catch (err) {
        console.warn('Failed to verify local session:', err);
      }

      // 2. Check Supabase if configured
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

  /**
   * Enterprise Credentials Authentication against backend SQLite
   */
  const signInWithCredentials = async (
    email: string,
    pass: string,
    mfaCode?: string,
    rememberMe: boolean = true
  ): Promise<{ error?: string; mfaRequired?: boolean }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass, mfaCode, rememberMe }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { error: data.message || data.error || 'Authentication failed' };
      }

      if (data.mfaRequired) {
        return { mfaRequired: true };
      }

      if (data.token && data.user) {
        try {
          localStorage.setItem('zaboraa_auth_token', data.token);
        } catch {}
        setAuthToken(data.token);

        const authedUser = {
          id: data.user.id,
          email: data.user.email,
          app_metadata: {},
          user_metadata: { name: data.user.name },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as User;

        const authedProfile: UserProfile = {
          userId: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          status: data.user.status,
          department: data.user.department,
          deskId: data.user.deskId,
          createdAt: data.user.createdAt,
          lastLoginAt: data.user.lastLoginAt,
          permissions: data.user.permissions || DEFAULT_ROLE_PERMISSIONS[data.user.role] || [],
          aal: data.user.aal || 'aal1',
        };

        setUser(authedUser);
        setProfile(authedProfile);
        setSessionExpired(false);
        return {};
      }

      return { error: 'Invalid response from authentication server' };
    } catch (err: any) {
      return { error: `Connection failed: ${err.message}` };
    }
  };

  const signInWithPassword = async (
    email: string,
    pass: string,
    mfaCode?: string,
    rememberMe?: boolean
  ): Promise<{ error?: string; mfaRequired?: boolean }> => {
    return signInWithCredentials(email, pass, mfaCode, rememberMe);
  };

  /**
   * Enterprise User Self-Registration
   */
  const registerAccount = async (params: {
    email: string;
    password: string;
    name: string;
    role?: string;
    department?: string;
    deskId?: string;
  }): Promise<{ error?: string }> => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (!res.ok) {
        return { error: data.message || data.error || 'Registration failed' };
      }

      if (data.token && data.user) {
        try {
          localStorage.setItem('zaboraa_auth_token', data.token);
        } catch {}
        setAuthToken(data.token);

        const authedUser = {
          id: data.user.id,
          email: data.user.email,
          app_metadata: {},
          user_metadata: { name: data.user.name },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as User;

        const authedProfile: UserProfile = {
          userId: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          status: data.user.status,
          department: data.user.department,
          deskId: data.user.deskId,
          createdAt: data.user.createdAt,
          lastLoginAt: data.user.lastLoginAt,
          permissions: data.user.permissions || DEFAULT_ROLE_PERMISSIONS[data.user.role] || [],
          aal: data.user.aal || 'aal1',
        };

        setUser(authedUser);
        setProfile(authedProfile);
        setSessionExpired(false);
        return {};
      }

      return { error: 'Registration failed' };
    } catch (err: any) {
      return { error: `Connection failed: ${err.message}` };
    }
  };

  /**
   * Update Profile Details & Credentials
   */
  const updateProfile = async (data: {
    name?: string;
    department?: string;
    deskId?: string;
    currentPassword?: string;
    newPassword?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    const token = getAccessToken();
    if (!token) {
      return { success: false, error: 'Authentication required' };
    }

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      const resData = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: resData.message || resData.error || 'Failed to update profile',
        };
      }

      if (resData.user) {
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                name: resData.user.name,
                department: resData.user.department,
                deskId: resData.user.deskId,
                lastLoginAt: resData.user.lastLoginAt || prev.lastLoginAt,
              }
            : null
        );

        setUser((prev) =>
          prev
            ? ({
                ...prev,
                user_metadata: {
                  ...prev.user_metadata,
                  name: resData.user.name,
                },
              } as unknown as User)
            : null
        );
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error updating profile' };
    }
  };

  const signInWithLocalAccount = async (email: string, targetRole: string): Promise<{ error?: string }> => {
    // Forward to credentials with default password
    const defaultPassword =
      targetRole === 'admin'
        ? 'Admin@Zaboraa2026!'
        : targetRole === 'master_admin'
        ? 'Master@Zaboraa2026!'
        : targetRole === 'viewer'
        ? 'Viewer@Zaboraa2026!'
        : 'Trader@Zaboraa2026!';
    return signInWithCredentials(email, defaultPassword);
  };

  const signInWithOtp = async (email: string): Promise<{ error?: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { error: 'Magic Link is only supported when Supabase SMTP is configured. Please use enterprise password credentials.' };
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
    const token = authToken || session?.access_token;
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }

    try {
      localStorage.removeItem('zaboraa_auth_token');
      localStorage.removeItem('zaboraa_local_session');
    } catch {}

    setAuthToken(null);
    setSession(null);
    setUser(null);
    setProfile(null);
    setPreviewRole(null);
  };

  const getAccessToken = useCallback((): string | null => {
    return authToken || session?.access_token || null;
  }, [authToken, session]);

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
        signInWithCredentials,
        signInWithPassword,
        registerAccount,
        updateProfile,
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

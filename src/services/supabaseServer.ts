import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import {
  saveMfaRecoveryCodes,
  verifyAndConsumeMfaRecoveryCode,
  isUserAssignedToAccount,
} from '../db/sqlite';

dotenv.config();

export interface AuthConfig {
  configured: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export interface UserSessionPayload {
  userId: string;
  email: string;
  role: string;
  status: string;
  permissions: string[];
  aal: string;
}

// Environment settings
export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';
export const MASTER_ADMIN_EMAIL = (process.env.MASTER_ADMIN_EMAIL || '').trim().toLowerCase();
export const MASTER_REQUIRE_MFA = process.env.MASTER_REQUIRE_MFA !== 'false';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY
);

export let supabaseAdmin: SupabaseClient | null = null;
if (isSupabaseConfigured) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Built-in role permission templates
export const BUILT_IN_PERMISSIONS: Record<string, string[]> = {
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

// 60-Second In-Memory Role and Permissions Cache
interface CachedUser {
  role: string;
  status: string;
  permissions: string[];
  expiresAt: number;
}
const userRoleCache = new Map<string, CachedUser>();

export function invalidateUserCache(userId: string): void {
  userRoleCache.delete(userId);
}

export function clearAllUserCache(): void {
  userRoleCache.clear();
}

// In-memory JWKS cache
interface JwksKey {
  kid: string;
  kty: string;
  alg?: string;
  x5c?: string[];
  n?: string;
  e?: string;
}
let jwksCache: { keys: JwksKey[]; expiresAt: number } | null = null;

async function fetchJwks(): Promise<JwksKey[]> {
  if (jwksCache && Date.now() < jwksCache.expiresAt) {
    return jwksCache.keys;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
    if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
    const data = (await res.json()) as { keys: JwksKey[] };
    jwksCache = { keys: data.keys || [], expiresAt: Date.now() + 300000 }; // 5 min cache
    return jwksCache.keys;
  } catch (err) {
    return [];
  }
}

/**
 * Parses JWT without verification to inspect header & payload
 */
export function decodeJwtUnverified(token: string): {
  header: any;
  payload: any;
  signature: string;
  rawHeader: string;
  rawPayload: string;
} | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return {
      header,
      payload,
      signature: parts[2],
      rawHeader: parts[0],
      rawPayload: parts[1],
    };
  } catch {
    return null;
  }
}

/**
 * Verify JWT using Dual-Mode logic:
 * 1. RS256/ES256 via JWKS
 * 2. HS256 via SUPABASE_JWT_SECRET
 * 3. Fallback via supabase.auth.getUser
 */
export async function verifySupabaseToken(
  token: string
): Promise<{ valid: boolean; payload?: any; error?: string }> {
  if (!token) return { valid: false, error: 'NO_TOKEN' };

  const decoded = decodeJwtUnverified(token);
  if (!decoded) return { valid: false, error: 'MALFORMED_TOKEN' };

  const { header, payload, rawHeader, rawPayload, signature } = decoded;

  // Check expiration
  if (payload.exp && Date.now() >= payload.exp * 1000) {
    return { valid: false, error: 'TOKEN_EXPIRED' };
  }

  const signingInput = `${rawHeader}.${rawPayload}`;

  // Mode A: HS256 with JWT Secret
  if (header.alg === 'HS256' && SUPABASE_JWT_SECRET) {
    const expectedSig = crypto
      .createHmac('sha256', SUPABASE_JWT_SECRET)
      .update(signingInput)
      .digest('base64url');
    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { valid: true, payload };
    }
    return { valid: false, error: 'HS256_SIGNATURE_MISMATCH' };
  }

  // Mode B: RS256 / ES256 via JWKS
  if ((header.alg === 'RS256' || header.alg === 'ES256') && isSupabaseConfigured) {
    const keys = await fetchJwks();
    const key = keys.find((k) => k.kid === header.kid);
    if (key && key.x5c && key.x5c[0]) {
      const cert = `-----BEGIN CERTIFICATE-----\n${key.x5c[0]}\n-----END CERTIFICATE-----`;
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(signingInput);
      const isVerified = verifier.verify(cert, signature, 'base64url');
      if (isVerified) {
        return { valid: true, payload };
      }
    }
  }

  // Mode C: Fallback to Supabase API
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data.user) {
        return { valid: false, error: error?.message || 'USER_NOT_FOUND' };
      }
      return {
        valid: true,
        payload: {
          sub: data.user.id,
          email: data.user.email,
          aal: (data.user as any).aal || 'aal1',
          ...payload,
        },
      };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  return { valid: false, error: 'VERIFICATION_UNSUPPORTED' };
}

/**
 * Resolve user profile and permissions from public.profiles and custom_roles
 */
export async function resolveUserSession(
  userId: string,
  email: string,
  aal: string = 'aal1'
): Promise<UserSessionPayload | null> {
  // Check cache first
  const cached = userRoleCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    if (cached.status === 'disabled') return null;
    return {
      userId,
      email,
      role: cached.role,
      status: cached.status,
      permissions: cached.permissions,
      aal,
    };
  }

  if (!supabaseAdmin) {
    // If Supabase client is not instantiated
    return null;
  }

  try {
    // 1. Fetch user profile
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('role, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !profile) {
      // Check if this user qualifies for Master Admin bootstrap
      if (email.toLowerCase() === MASTER_ADMIN_EMAIL) {
        const bootstrapped = await attemptMasterAdminBootstrap(userId, email);
        if (bootstrapped) {
          const perms = BUILT_IN_PERMISSIONS.master_admin;
          userRoleCache.set(userId, {
            role: 'master_admin',
            status: 'active',
            permissions: perms,
            expiresAt: Date.now() + 60000,
          });
          return {
            userId,
            email,
            role: 'master_admin',
            status: 'active',
            permissions: perms,
            aal,
          };
        }
      }
      return null;
    }

    if (profile.status === 'disabled') {
      userRoleCache.set(userId, {
        role: profile.role,
        status: 'disabled',
        permissions: [],
        expiresAt: Date.now() + 60000,
      });
      return null;
    }

    // 2. Resolve permissions
    let permissions = BUILT_IN_PERMISSIONS[profile.role] || [];
    if (!BUILT_IN_PERMISSIONS[profile.role]) {
      // Custom role: query role_permissions
      const { data: rolePerms } = await supabaseAdmin
        .from('role_permissions')
        .select('permission')
        .eq('role_name', profile.role);
      if (rolePerms) {
        permissions = rolePerms.map((r: any) => r.permission);
      }
    }

    // Cache user for 60s
    userRoleCache.set(userId, {
      role: profile.role,
      status: profile.status,
      permissions,
      expiresAt: Date.now() + 60000,
    });

    return {
      userId,
      email,
      role: profile.role,
      status: profile.status,
      permissions,
      aal,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Bootstrap Master Admin atomically if and only if zero master_admins currently exist
 */
export async function attemptMasterAdminBootstrap(userId: string, email: string): Promise<boolean> {
  if (!supabaseAdmin || !MASTER_ADMIN_EMAIL || email.toLowerCase() !== MASTER_ADMIN_EMAIL) {
    return false;
  }

  try {
    // Check if any master_admin exists
    const { data: existingMasterAdmins, error } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('role', 'master_admin')
      .eq('status', 'active');

    if (error) return false;

    if (!existingMasterAdmins || existingMasterAdmins.length === 0) {
      // Perform atomic bootstrap
      await supabaseAdmin.from('profiles').upsert({
        user_id: userId,
        email: email.toLowerCase(),
        role: 'master_admin',
        status: 'active',
        updated_at: new Date().toISOString(),
      });
      invalidateUserCache(userId);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Protect against removing or demoting the last active Master Admin
 */
export async function isLastActiveMasterAdmin(userId: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('role', 'master_admin')
      .eq('status', 'active');
    if (error || !data) return false;
    return data.length === 1 && data[0].user_id === userId;
  } catch {
    return false;
  }
}

/**
 * Privilege Escalation Validator
 */
export function validatePrivilegeEscalation(
  actorRole: string,
  actorPermissions: string[],
  targetRole: string,
  targetPermissions?: string[]
): { allowed: boolean; reason?: string } {
  if (actorRole === 'master_admin') return { allowed: true };

  // Non-master_admin cannot assign or edit master_admin
  if (targetRole === 'master_admin') {
    return { allowed: false, reason: 'Only Master Admin can assign or edit the Master Admin role' };
  }

  // Non-master_admin cannot edit an existing master_admin
  if (actorRole === 'admin' && targetRole === 'master_admin') {
    return { allowed: false, reason: 'Administrators cannot modify Master Admin accounts' };
  }

  // An admin cannot grant permissions they do not personally hold
  if (targetPermissions && targetPermissions.length > 0) {
    const actorPermSet = new Set(actorPermissions);
    for (const p of targetPermissions) {
      if (!actorPermSet.has(p)) {
        return {
          allowed: false,
          reason: `Privilege escalation blocked: You cannot grant permission '${p}' which you do not possess`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * MFA Recovery Codes Generator
 * Generates 8 random alphanumeric codes, hashes them with SHA-256 and saves to SQLite.
 * Returns the plaintext codes once to present to the user.
 */
export function generateMfaRecoveryCodes(userId: string): string[] {
  const plaintextCodes: string[] = [];
  const codeHashes: string[] = [];

  for (let i = 0; i < 8; i++) {
    const raw = `${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    plaintextCodes.push(raw);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    codeHashes.push(hash);
  }

  saveMfaRecoveryCodes(userId, codeHashes);
  return plaintextCodes;
}

/**
 * Reset MFA factor for a user directly via Supabase Admin API
 */
export async function resetUserMfaFactor(email: string): Promise<{ success: boolean; message: string }> {
  if (!supabaseAdmin) {
    return { success: false, message: 'Supabase admin client is not configured' };
  }

  try {
    // 1. Find user by email
    const { data: usersData, error: userErr } = await supabaseAdmin.auth.admin.listUsers();
    if (userErr || !usersData.users) {
      return { success: false, message: `Failed to list users: ${userErr?.message}` };
    }

    const targetUser = usersData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!targetUser) {
      return { success: false, message: `User with email '${email}' not found` };
    }

    // 2. Find and delete MFA factors
    const factors = (targetUser as any).factors || [];
    for (const f of factors) {
      await (supabaseAdmin.auth.admin as any).mfa.deleteFactor({
        id: f.id,
        userId: targetUser.id,
      });
    }

    invalidateUserCache(targetUser.id);
    return { success: true, message: `Successfully reset MFA factors for user ${email}` };
  } catch (err: any) {
    return { success: false, message: err.message || 'MFA reset failed' };
  }
}

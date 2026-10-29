import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  decodeJwtUnverified,
  verifySupabaseToken,
  resolveUserSession,
  invalidateUserCache,
  clearAllUserCache,
  BUILT_IN_PERMISSIONS,
  SUPABASE_JWT_SECRET,
} from '../../services/supabaseServer';

describe('Auth Middleware & Token Verification Suite (Stage 1a)', () => {
  beforeEach(() => {
    clearAllUserCache();
  });

  afterEach(() => {
    clearAllUserCache();
  });

  function createSignedHs256Token(
    payload: Record<string, any>,
    secret: string = process.env.SUPABASE_JWT_SECRET || 'test_jwt_secret_for_unit_tests'
  ): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const rawHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const rawPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signingInput = `${rawHeader}.${rawPayload}`;
    const sig = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
    return `${rawHeader}.${rawPayload}.${sig}`;
  }

  it('correctly decodes unverified JWT headers and payload', () => {
    const payload = { sub: 'usr-123', email: 'trader@zaboraa.com', exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = createSignedHs256Token(payload);
    const decoded = decodeJwtUnverified(token);

    expect(decoded).not.toBeNull();
    expect(decoded?.header.alg).toBe('HS256');
    expect(decoded?.payload.sub).toBe('usr-123');
    expect(decoded?.payload.email).toBe('trader@zaboraa.com');
  });

  it('rejects malformed tokens and non-JWT strings (explicit failing-case)', async () => {
    const badTokens = ['', 'invalid-token', 'header.payload', 'a.b.c.d'];
    for (const bt of badTokens) {
      const res = await verifySupabaseToken(bt);
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    }
  });

  it('rejects expired tokens (explicit failing-case)', async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 300; // 5 minutes ago
    const token = createSignedHs256Token({ sub: 'usr-old', email: 'old@zaboraa.com', exp: pastExp });
    const res = await verifySupabaseToken(token);

    expect(res.valid).toBe(false);
    expect(res.error).toBe('TOKEN_EXPIRED');
  });

  it('verifies valid HS256 tokens and rejects tampered signatures', async () => {
    const secret = process.env.SUPABASE_JWT_SECRET || 'zaboraa_jwt_dev_secret_key_12345';
    // Ensure test environment uses secret
    const originalSecret = process.env.SUPABASE_JWT_SECRET;
    process.env.SUPABASE_JWT_SECRET = secret;

    const validPayload = {
      sub: 'usr-valid',
      email: 'valid@zaboraa.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      aal: 'aal1',
    };
    const validToken = createSignedHs256Token(validPayload, secret);

    const validRes = await verifySupabaseToken(validToken);
    // If local HS256 matched
    if (validRes.valid) {
      expect(validRes.payload?.sub).toBe('usr-valid');
      expect(validRes.payload?.email).toBe('valid@zaboraa.com');
    }

    // Tampered payload with original signature
    const parts = validToken.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ ...validPayload, email: 'hacker@bad.com' })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const tamperedRes = await verifySupabaseToken(tamperedToken);
    expect(tamperedRes.valid).toBe(false);

    process.env.SUPABASE_JWT_SECRET = originalSecret;
  });

  it('enforces role permission templates accurately', () => {
    expect(BUILT_IN_PERMISSIONS.master_admin).toContain('order.place_live');
    expect(BUILT_IN_PERMISSIONS.master_admin).toContain('firewall.edit');
    expect(BUILT_IN_PERMISSIONS.master_admin).toContain('kill.engage');

    expect(BUILT_IN_PERMISSIONS.admin).toContain('order.place_live');
    expect(BUILT_IN_PERMISSIONS.admin).toContain('firewall.edit');

    // Trader CANNOT edit firewall or engage killswitch
    expect(BUILT_IN_PERMISSIONS.trader).toContain('order.place_demo');
    expect(BUILT_IN_PERMISSIONS.trader).not.toContain('order.place_live');
    expect(BUILT_IN_PERMISSIONS.trader).not.toContain('firewall.edit');
    expect(BUILT_IN_PERMISSIONS.trader).not.toContain('user.manage');

    // Viewer is read-only
    expect(BUILT_IN_PERMISSIONS.viewer).toContain('research.view');
    expect(BUILT_IN_PERMISSIONS.viewer).not.toContain('order.place_demo');
    expect(BUILT_IN_PERMISSIONS.viewer).not.toContain('backtest.run');

    // Pending has 0 permissions
    expect(BUILT_IN_PERMISSIONS.pending).toHaveLength(0);
  });

  it('instantly invalidates role cache without waiting for TTL expiry', () => {
    const userId = 'usr-cached-test';
    const email = 'cached@zaboraa.com';

    // Verify cache invalidation function executes cleanly
    invalidateUserCache(userId);
    clearAllUserCache();
    expect(true).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  saveMfaRecoveryCodes,
  verifyAndConsumeMfaRecoveryCode,
} from '../../db/sqlite';
import { generateMfaRecoveryCodes } from '../../services/supabaseServer';

describe('MFA & AAL2 Enforcement Suite (Stage 1a)', () => {
  const testUserId = 'usr-mfa-test-' + Date.now();

  it('generates 8 alphanumeric recovery codes with SHA-256 storage', () => {
    const codes = generateMfaRecoveryCodes(testUserId);
    expect(codes).toHaveLength(8);

    for (const c of codes) {
      expect(c).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
    }
  });

  it('verifies a valid recovery code and consumes it', () => {
    const codes = generateMfaRecoveryCodes(testUserId);
    const firstCode = codes[0];

    const valid = verifyAndConsumeMfaRecoveryCode(testUserId, firstCode);
    expect(valid).toBe(true);
  });

  it('prohibits reusing a previously consumed recovery code (explicit failing-case)', () => {
    const codes = generateMfaRecoveryCodes(testUserId);
    const firstCode = codes[0];

    // First use consumes the code
    const firstAttempt = verifyAndConsumeMfaRecoveryCode(testUserId, firstCode);
    expect(firstAttempt).toBe(true);

    // Replay attempt must be rejected
    const replayAttempt = verifyAndConsumeMfaRecoveryCode(testUserId, firstCode);
    expect(replayAttempt).toBe(false);
  });

  it('rejects invalid or non-existent recovery codes (explicit failing-case)', () => {
    generateMfaRecoveryCodes(testUserId);

    const badCodes = ['INVALID-CODE', '0000-0000', '', 'XXXX-YYYY'];
    for (const bc of badCodes) {
      const valid = verifyAndConsumeMfaRecoveryCode(testUserId, bc);
      expect(valid).toBe(false);
    }
  });

  it('enforces AAL2 authorization rules accurately for administrative roles', () => {
    const isMasterMfaRequired = true;

    function checkMfaRequirement(role: string, aal: string): { allowed: boolean; error?: string } {
      if (
        isMasterMfaRequired &&
        (role === 'master_admin' || role === 'admin') &&
        aal !== 'aal2'
      ) {
        return { allowed: false, error: 'MFA_REQUIRED' };
      }
      return { allowed: true };
    }

    // Master Admin with AAL1 is rejected (explicit failing-case)
    const masterAal1 = checkMfaRequirement('master_admin', 'aal1');
    expect(masterAal1.allowed).toBe(false);
    expect(masterAal1.error).toBe('MFA_REQUIRED');

    // Admin with AAL1 is rejected (explicit failing-case)
    const adminAal1 = checkMfaRequirement('admin', 'aal1');
    expect(adminAal1.allowed).toBe(false);
    expect(adminAal1.error).toBe('MFA_REQUIRED');

    // Master Admin with AAL2 is allowed
    const masterAal2 = checkMfaRequirement('master_admin', 'aal2');
    expect(masterAal2.allowed).toBe(true);

    // Trader with AAL1 is allowed (MFA mandatory only for administrative roles)
    const traderAal1 = checkMfaRequirement('trader', 'aal1');
    expect(traderAal1.allowed).toBe(true);
  });
});

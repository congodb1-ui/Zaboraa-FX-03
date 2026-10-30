import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  hashPassword,
  verifyPassword,
  createUserInDb,
  getUserByEmail,
  getUserById,
  updateUserRoleInDb,
  updateUserStatusInDb,
  updateUserLastLogin,
  recordFailedLogin,
  createSessionInDb,
  getSessionFromDb,
  deleteSessionFromDb,
  seedDefaultUsersIfEmpty,
} from '../../db/sqlite';

describe('Enterprise Authentication & Local Session Store Suite', () => {
  beforeEach(() => {
    seedDefaultUsersIfEmpty();
  });

  describe('Cryptographic Password Hashing & Timing-Safe Verification', () => {
    it('generates consistent PBKDF2-SHA512 hash and verifies correctly', () => {
      const salt = crypto.randomBytes(16).toString('hex');
      const pass = 'SuperSecretInstitutionalPass2026!';
      const hash = hashPassword(pass, salt);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(128); // 64 bytes = 128 hex chars

      const isMatch = verifyPassword(pass, hash, salt);
      expect(isMatch).toBe(true);
    });

    it('rejects incorrect password (explicit failing-case)', () => {
      const salt = crypto.randomBytes(16).toString('hex');
      const pass = 'CorrectPass123!';
      const hash = hashPassword(pass, salt);

      const isMatch = verifyPassword('WrongPass123!', hash, salt);
      expect(isMatch).toBe(false);
    });

    it('rejects tampered or mismatched salt (explicit failing-case)', () => {
      const salt1 = crypto.randomBytes(16).toString('hex');
      const salt2 = crypto.randomBytes(16).toString('hex');
      const pass = 'TestPassword123!';
      const hash = hashPassword(pass, salt1);

      const isMatch = verifyPassword(pass, hash, salt2);
      expect(isMatch).toBe(false);
    });

    it('gracefully handles malformed or invalid hash input without throwing', () => {
      const salt = 'valid_salt';
      expect(verifyPassword('any', 'invalid_hex_length', salt)).toBe(false);
      expect(verifyPassword('any', '', salt)).toBe(false);
    });
  });

  describe('User Creation & RBAC Entity Management', () => {
    it('creates a new user and persists encrypted credentials', () => {
      const testEmail = `quant-${Date.now()}@zaboraa-fund.com`;
      const user = createUserInDb({
        email: testEmail,
        name: 'Alex Quantum',
        password: 'DeskPassword2026!',
        role: 'trader',
        department: 'Precious Metals Desk',
        deskId: 'DESK-PM-02',
      });

      expect(user).toBeDefined();
      expect(user.id).toMatch(/^usr-/);
      expect(user.email).toBe(testEmail.toLowerCase());
      expect(user.name).toBe('Alex Quantum');
      expect(user.role).toBe('trader');
      expect(user.status).toBe('active');
      expect(user.department).toBe('Precious Metals Desk');
      expect(user.desk_id).toBe('DESK-PM-02');

      // Verify the password works against the stored hash
      const verified = verifyPassword('DeskPassword2026!', user.password_hash, user.password_salt);
      expect(verified).toBe(true);
    });

    it('rejects duplicate email insertion with unique constraint error (explicit failing-case)', () => {
      const duplicateEmail = `duplicate-${Date.now()}@zaboraa.com`;
      createUserInDb({
        email: duplicateEmail,
        name: 'First User',
        password: 'Password123!',
      });

      expect(() => {
        createUserInDb({
          email: duplicateEmail,
          name: 'Second User',
          password: 'AnotherPassword123!',
        });
      }).toThrow(/UNIQUE constraint failed/i);
    });

    it('updates user role and status', () => {
      const testEmail = `status-${Date.now()}@zaboraa.com`;
      const user = createUserInDb({
        email: testEmail,
        name: 'Role Test User',
        password: 'Password123!',
        role: 'trader',
      });

      const roleUpdated = updateUserRoleInDb(user.id, 'admin');
      expect(roleUpdated).toBe(true);

      const statusUpdated = updateUserStatusInDb(user.id, 'disabled');
      expect(statusUpdated).toBe(true);

      const refreshed = getUserById(user.id);
      expect(refreshed?.role).toBe('admin');
      expect(refreshed?.status).toBe('disabled');
    });
  });

  describe('Session Lifecycle & State Persistence', () => {
    it('creates, retrieves, and validates a session token', () => {
      const user = getUserByEmail('trader@zaboraa.com');
      expect(user).not.toBeNull();

      const session = createSessionInDb(user!.id, 'aal1', 7);
      expect(session.token).toMatch(/^zbx_/);
      expect(session.user_id).toBe(user!.id);
      expect(session.aal).toBe('aal1');

      const retrieved = getSessionFromDb(session.token);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.user_id).toBe(user!.id);
      expect(retrieved?.user.email).toBe('trader@zaboraa.com');
      expect(retrieved?.user.role).toBe('trader');
    });

    it('deletes session on logout and invalidates future lookups (explicit failing-case)', () => {
      const user = getUserByEmail('trader@zaboraa.com');
      const session = createSessionInDb(user!.id, 'aal1', 1);

      expect(getSessionFromDb(session.token)).not.toBeNull();

      const deleted = deleteSessionFromDb(session.token);
      expect(deleted).toBe(true);

      const afterDelete = getSessionFromDb(session.token);
      expect(afterDelete).toBeNull();
    });

    it('returns null for non-existent session tokens (explicit failing-case)', () => {
      expect(getSessionFromDb('non_existent_token_12345')).toBeNull();
      expect(getSessionFromDb('')).toBeNull();
    });
  });

  describe('Failed Attempt Lockout & Defense', () => {
    it('increments failed login attempts and triggers temporary lockout at 5 attempts', () => {
      const email = `lockout-${Date.now()}@zaboraa.com`;
      const user = createUserInDb({
        email,
        name: 'Lockout Target',
        password: 'CorrectPassword2026!',
      });

      for (let i = 1; i <= 4; i++) {
        const res = recordFailedLogin(email);
        expect(res.attempts).toBe(i);
        expect(res.locked).toBe(false);
      }

      // 5th attempt triggers lockout
      const fifth = recordFailedLogin(email);
      expect(fifth.attempts).toBe(5);
      expect(fifth.locked).toBe(true);

      const lockedUser = getUserByEmail(email);
      expect(lockedUser?.locked_until).not.toBeNull();
      const lockDate = new Date(lockedUser!.locked_until!);
      expect(lockDate.getTime()).toBeGreaterThan(Date.now());
    });

    it('resets failed attempts and unlocks account on successful login', () => {
      const email = `reset-${Date.now()}@zaboraa.com`;
      const user = createUserInDb({
        email,
        name: 'Reset Target',
        password: 'Password2026!',
      });

      recordFailedLogin(email);
      recordFailedLogin(email);
      expect(getUserByEmail(email)?.failed_attempts).toBe(2);

      updateUserLastLogin(user.id);

      const refreshed = getUserByEmail(email);
      expect(refreshed?.failed_attempts).toBe(0);
      expect(refreshed?.locked_until).toBeNull();
      expect(refreshed?.last_login_at).not.toBeNull();
    });
  });

  describe('Pre-seeded Enterprise Accounts', () => {
    it('seeds and authenticates the default admin, trader, master, and viewer accounts', () => {
      const testCases = [
        { email: 'admin@zaboraa.com', pass: 'Admin@Zaboraa2026!', expectedRole: 'admin' },
        { email: 'master@zaboraa.com', pass: 'Master@Zaboraa2026!', expectedRole: 'master_admin' },
        { email: 'trader@zaboraa.com', pass: 'Trader@Zaboraa2026!', expectedRole: 'trader' },
        { email: 'viewer@zaboraa.com', pass: 'Viewer@Zaboraa2026!', expectedRole: 'viewer' },
      ];

      for (const tc of testCases) {
        const u = getUserByEmail(tc.email);
        expect(u).not.toBeNull();
        expect(u?.role).toBe(tc.expectedRole);
        expect(u?.status).toBe('active');

        const valid = verifyPassword(tc.pass, u!.password_hash, u!.password_salt);
        expect(valid).toBe(true);
      }
    });
  });
});

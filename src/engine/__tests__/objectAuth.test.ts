import { describe, it, expect, beforeEach } from 'vitest';
import {
  assignUserAccount,
  removeUserAccount,
  getUserAssignedAccounts,
  isUserAssignedToAccount,
} from '../../db/sqlite';

describe('Object-Level Account Authorization Suite (Stage 1a)', () => {
  const testUserId = 'usr-test-trader-' + Date.now();
  const testAccountId1 = 'acc-desk-101';
  const testAccountId2 = 'acc-desk-102';

  beforeEach(() => {
    removeUserAccount(testUserId, testAccountId1);
    removeUserAccount(testUserId, testAccountId2);
  });

  it('rejects access when user is not assigned to target account (explicit failing-case)', () => {
    const hasAccess = isUserAssignedToAccount(testUserId, testAccountId1, 'trader');
    expect(hasAccess).toBe(false);

    const accounts = getUserAssignedAccounts(testUserId);
    expect(accounts).not.toContain(testAccountId1);
  });

  it('allows access after assignment and reflects in assigned accounts list', () => {
    assignUserAccount(testUserId, testAccountId1, 'master_admin@zaboraa.com');

    const hasAccess = isUserAssignedToAccount(testUserId, testAccountId1, 'trader');
    expect(hasAccess).toBe(true);

    const accounts = getUserAssignedAccounts(testUserId);
    expect(accounts).toContain(testAccountId1);

    // But still denies unassigned second account (explicit failing-case)
    const hasAccessAccount2 = isUserAssignedToAccount(testUserId, testAccountId2, 'trader');
    expect(hasAccessAccount2).toBe(false);
  });

  it('revokes access immediately when account assignment is removed', () => {
    assignUserAccount(testUserId, testAccountId1, 'master_admin@zaboraa.com');
    expect(isUserAssignedToAccount(testUserId, testAccountId1, 'trader')).toBe(true);

    removeUserAccount(testUserId, testAccountId1);
    expect(isUserAssignedToAccount(testUserId, testAccountId1, 'trader')).toBe(false);
  });

  it('grants universal access to master_admin regardless of explicit assignments', () => {
    // Unassigned account
    const hasAccess = isUserAssignedToAccount(testUserId, 'arbitrary-account-999', 'master_admin');
    expect(hasAccess).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { validatePrivilegeEscalation } from '../../services/supabaseServer';

describe('Privilege Escalation Barriers Suite (Stage 1a)', () => {
  const adminPermissions = [
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
  ];

  it('allows master_admin unrestricted authorization', () => {
    const check1 = validatePrivilegeEscalation('master_admin', [], 'master_admin');
    expect(check1.allowed).toBe(true);

    const check2 = validatePrivilegeEscalation('master_admin', [], 'admin', ['settings.edit']);
    expect(check2.allowed).toBe(true);
  });

  it('blocks non-master_admin from assigning or promoting anyone to master_admin (explicit failing-case)', () => {
    const check = validatePrivilegeEscalation('admin', adminPermissions, 'master_admin');
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Only Master Admin can assign or edit the Master Admin role');
  });

  it('blocks an administrator from modifying a master_admin account (explicit failing-case)', () => {
    const check = validatePrivilegeEscalation('admin', adminPermissions, 'master_admin');
    expect(check.allowed).toBe(false);
    expect(check.reason).toBeDefined();
  });

  it('blocks an administrator from granting permissions they do not possess (explicit failing-case)', () => {
    // Attempting to grant 'settings.edit' which adminPermissions lacks
    const targetPerms = ['research.view', 'settings.edit'];
    const check = validatePrivilegeEscalation('admin', adminPermissions, 'trader', targetPerms);

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Privilege escalation blocked: You cannot grant permission 'settings.edit'");
  });

  it('allows administrator to grant permissions that are within their own granted permissions', () => {
    const validPerms = ['research.view', 'order.place_demo', 'firewall.view'];
    const check = validatePrivilegeEscalation('admin', adminPermissions, 'trader', validPerms);

    expect(check.allowed).toBe(true);
  });

  it('blocks a trader from managing users or granting admin roles (explicit failing-case)', () => {
    const traderPerms = ['research.view', 'order.place_demo'];
    const check = validatePrivilegeEscalation('trader', traderPerms, 'admin', ['firewall.edit']);

    expect(check.allowed).toBe(false);
  });
});

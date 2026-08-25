import { PERMISSIONS } from './permissions.catalog';
import { ROLE_DEFINITIONS, ROLES } from './roles.catalog';

function permissionsOf(roleKey: string): Set<string> {
  const role = ROLE_DEFINITIONS.find((r) => r.key === roleKey);
  if (!role) throw new Error(`No role definition found for "${roleKey}"`);
  return new Set(role.permissions);
}

/**
 * These assertions exist to catch an accidental widening of the seeded
 * role catalog at CI time, not just in code review — a future edit that
 * grants `admin` `wallet.adjust` (for example) should fail a test, not
 * silently ship a maker-checker violation.
 */
describe('ROLE_DEFINITIONS — separation of duties', () => {
  it('admin cannot approve payments, adjust wallets, or manage roles', () => {
    const admin = permissionsOf(ROLES.ADMIN);
    expect(admin.has(PERMISSIONS.WALLET_ADJUST)).toBe(false);
    expect(admin.has(PERMISSIONS.DEPOSITS_APPROVE)).toBe(false);
    expect(admin.has(PERMISSIONS.WITHDRAWALS_APPROVE)).toBe(false);
    expect(admin.has(PERMISSIONS.ROLES_MANAGE)).toBe(false);
  });

  it('support holds no mutating permission at all — it is a strictly read-only role', () => {
    const support = permissionsOf(ROLES.SUPPORT);
    const mutatingSuffixes = ['.approve', '.manage', '.settle', '.suspend', '.adjust', '.review', '.update'];
    expect(support.size).toBeGreaterThan(0);
    for (const permission of support) {
      expect(mutatingSuffixes.some((suffix) => permission.endsWith(suffix))).toBe(false);
    }
  });

  it('finance cannot suspend users, manage markets, or manage roles', () => {
    const finance = permissionsOf(ROLES.FINANCE);
    expect(finance.has(PERMISSIONS.USERS_SUSPEND)).toBe(false);
    expect(finance.has(PERMISSIONS.MARKETS_MANAGE)).toBe(false);
    expect(finance.has(PERMISSIONS.ROLES_MANAGE)).toBe(false);
  });

  it('only super_admin holds roles.manage', () => {
    for (const role of ROLE_DEFINITIONS) {
      if (role.key === ROLES.SUPER_ADMIN) continue;
      expect(permissionsOf(role.key).has(PERMISSIONS.ROLES_MANAGE)).toBe(false);
    }
  });

  it('risk can review KYC and view audit logs but cannot manage markets or adjust wallets', () => {
    const risk = permissionsOf(ROLES.RISK);
    expect(risk.has(PERMISSIONS.KYC_REVIEW)).toBe(true);
    expect(risk.has(PERMISSIONS.AUDIT_VIEW)).toBe(true);
    expect(risk.has(PERMISSIONS.MARKETS_MANAGE)).toBe(false);
    expect(risk.has(PERMISSIONS.WALLET_ADJUST)).toBe(false);
  });

  it('the plain user role holds no permissions at all', () => {
    expect(permissionsOf(ROLES.USER).size).toBe(0);
  });

  it('no non-super_admin role holds settings.manage', () => {
    for (const role of ROLE_DEFINITIONS) {
      if (role.key === ROLES.SUPER_ADMIN) continue;
      expect(permissionsOf(role.key).has(PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
    }
  });
});

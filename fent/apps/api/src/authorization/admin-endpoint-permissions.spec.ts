import { AuditLogController } from '../audit/audit-log.controller';
import { AdminBettingController } from '../betting/admin-betting.controller';
import { AuthorizationController } from './authorization.controller';
import { REQUIRED_PERMISSIONS_KEY } from './decorators/require-permissions.decorator';
import { PERMISSIONS } from './permissions.catalog';
import { ReportsController } from '../reports/reports.controller';
import { UsersController } from '../users/users.controller';
import { AdminWalletController } from '../wallet/admin-wallet.controller';

/**
 * `PermissionsGuard` itself is generic and unchanged by this phase — what
 * actually needs proving per new route is that the *right* permission key
 * was attached via `@RequirePermissions(...)`. A typo here (e.g. gating
 * the bonus-grant route on `wallet.view` instead of `wallet.adjust`) would
 * pass every other test in this codebase while silently letting a
 * lower-privileged role reach a high-risk action.
 */
function requiredPermissions(target: object, methodName: string): string[] {
  const metadata = Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, (target as Record<string, unknown>)[methodName] as object);
  return metadata as string[];
}

describe('new admin control panel endpoints — decorator metadata', () => {
  it('UsersController.reviewKyc requires kyc.review', () => {
    expect(requiredPermissions(UsersController.prototype, 'reviewKyc')).toEqual([PERMISSIONS.KYC_REVIEW]);
  });

  it('UsersController.setEligibility requires users.suspend', () => {
    expect(requiredPermissions(UsersController.prototype, 'setEligibility')).toEqual([PERMISSIONS.USERS_SUSPEND]);
  });

  it('AuditLogController.list requires audit.view', () => {
    expect(requiredPermissions(AuditLogController.prototype, 'list')).toEqual([PERMISSIONS.AUDIT_VIEW]);
  });

  it('AdminWalletController.grantBonus requires wallet.adjust — the same gate as adjustBalance', () => {
    expect(requiredPermissions(AdminWalletController.prototype, 'grantBonus')).toEqual([PERMISSIONS.WALLET_ADJUST]);
    expect(requiredPermissions(AdminWalletController.prototype, 'adjustBalance')).toEqual([PERMISSIONS.WALLET_ADJUST]);
  });

  it('ReportsController requires reports.view on both endpoints', () => {
    expect(requiredPermissions(ReportsController.prototype, 'overview')).toEqual([PERMISSIONS.REPORTS_VIEW]);
    expect(requiredPermissions(ReportsController.prototype, 'revenue')).toEqual([PERMISSIONS.REPORTS_VIEW]);
  });

  it('AdminBettingController.listBets and getBet require bets.view', () => {
    expect(requiredPermissions(AdminBettingController.prototype, 'listBets')).toEqual([PERMISSIONS.BETS_VIEW]);
    expect(requiredPermissions(AdminBettingController.prototype, 'getBet')).toEqual([PERMISSIONS.BETS_VIEW]);
  });

  it('AuthorizationController requires roles.manage on both catalog endpoints', () => {
    expect(requiredPermissions(AuthorizationController.prototype, 'listRoles')).toEqual([PERMISSIONS.ROLES_MANAGE]);
    expect(requiredPermissions(AuthorizationController.prototype, 'listPermissions')).toEqual([PERMISSIONS.ROLES_MANAGE]);
  });
});

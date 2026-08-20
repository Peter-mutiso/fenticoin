/**
 * The full set of granular permissions the platform understands. This is
 * the single source of truth: the `permissions` table is seeded from this
 * array (see `database/seed/seed-rbac.ts`), and `@RequirePermissions(...)`
 * decorators only ever reference `PERMISSIONS.*` constants — never raw
 * strings — so a typo fails at compile time, not at request time.
 */
export const PERMISSIONS = {
  USERS_VIEW: 'users.view',
  USERS_UPDATE: 'users.update',
  USERS_SUSPEND: 'users.suspend',
  KYC_VIEW: 'kyc.view',
  KYC_REVIEW: 'kyc.review',
  DEPOSITS_VIEW: 'deposits.view',
  DEPOSITS_APPROVE: 'deposits.approve',
  WITHDRAWALS_VIEW: 'withdrawals.view',
  WITHDRAWALS_APPROVE: 'withdrawals.approve',
  WALLET_VIEW: 'wallet.view',
  WALLET_ADJUST: 'wallet.adjust',
  BETS_VIEW: 'bets.view',
  BETS_SETTLE: 'bets.settle',
  MARKETS_VIEW: 'markets.view',
  MARKETS_MANAGE: 'markets.manage',
  ODDS_MANAGE: 'odds.manage',
  SETTINGS_MANAGE: 'settings.manage',
  REPORTS_VIEW: 'reports.view',
  AUDIT_VIEW: 'audit.view',
  ROLES_MANAGE: 'roles.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

interface PermissionDefinition {
  key: PermissionKey;
  category: string;
  description: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: PERMISSIONS.USERS_VIEW, category: 'users', description: 'View user accounts and profiles' },
  { key: PERMISSIONS.USERS_UPDATE, category: 'users', description: 'Edit user account/profile fields' },
  {
    key: PERMISSIONS.USERS_SUSPEND,
    category: 'users',
    description: 'Suspend, unsuspend, or ban user accounts',
  },
  { key: PERMISSIONS.KYC_VIEW, category: 'kyc', description: 'View KYC submissions and status' },
  {
    key: PERMISSIONS.KYC_REVIEW,
    category: 'kyc',
    description: 'Approve or reject KYC submissions',
  },
  { key: PERMISSIONS.DEPOSITS_VIEW, category: 'payments', description: 'View deposit transactions' },
  {
    key: PERMISSIONS.DEPOSITS_APPROVE,
    category: 'payments',
    description: 'Approve or reject pending deposits',
  },
  {
    key: PERMISSIONS.WITHDRAWALS_VIEW,
    category: 'payments',
    description: 'View withdrawal transactions',
  },
  {
    key: PERMISSIONS.WITHDRAWALS_APPROVE,
    category: 'payments',
    description: 'Approve or reject pending withdrawals',
  },
  { key: PERMISSIONS.WALLET_VIEW, category: 'wallet', description: "View user wallet balances/ledger" },
  {
    key: PERMISSIONS.WALLET_ADJUST,
    category: 'wallet',
    description: 'Post manual ledger adjustments (maker-checker required)',
  },
  { key: PERMISSIONS.BETS_VIEW, category: 'betting', description: 'View bets/positions' },
  { key: PERMISSIONS.BETS_SETTLE, category: 'betting', description: 'Manually settle or void bets' },
  { key: PERMISSIONS.MARKETS_VIEW, category: 'markets', description: 'View market/instrument config' },
  {
    key: PERMISSIONS.MARKETS_MANAGE,
    category: 'markets',
    description: 'Create, edit, pause, or close markets',
  },
  { key: PERMISSIONS.ODDS_MANAGE, category: 'markets', description: 'Edit payout rates / odds' },
  {
    key: PERMISSIONS.SETTINGS_MANAGE,
    category: 'platform',
    description: 'Edit platform-wide site configuration',
  },
  { key: PERMISSIONS.REPORTS_VIEW, category: 'platform', description: 'View analytics/reports' },
  { key: PERMISSIONS.AUDIT_VIEW, category: 'platform', description: 'View the audit log' },
  {
    key: PERMISSIONS.ROLES_MANAGE,
    category: 'platform',
    description: 'Grant or revoke roles on other users',
  },
];

import { ALL_PERMISSIONS, PERMISSIONS, type PermissionKey } from './permissions.catalog';

export const ROLES = {
  USER: 'user',
  SUPPORT: 'support',
  FINANCE: 'finance',
  RISK: 'risk',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: RoleKey[] = Object.values(ROLES);

interface RoleDefinition {
  key: RoleKey;
  description: string;
  permissions: PermissionKey[];
}

/**
 * The default role -> permission matrix, seeded into `role_permissions`.
 * Deliberately modeled as separation-of-duties rather than a strict
 * hierarchy: `admin` can operate day-to-day markets/support tooling but
 * cannot approve payments, adjust wallets, or manage roles — those require
 * `finance`/`super_admin` specifically, so no single non-super-admin role
 * can both create and approve a financial movement.
 */
export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: ROLES.USER,
    description: 'A regular platform user. Holds no administrative permissions.',
    permissions: [],
  },
  {
    key: ROLES.SUPPORT,
    description: 'Customer support — read-only visibility into accounts and activity.',
    permissions: [
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.KYC_VIEW,
      PERMISSIONS.DEPOSITS_VIEW,
      PERMISSIONS.WITHDRAWALS_VIEW,
      PERMISSIONS.WALLET_VIEW,
      PERMISSIONS.BETS_VIEW,
      PERMISSIONS.MARKETS_VIEW,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
  {
    key: ROLES.FINANCE,
    description: 'Finance operations — approves payments and posts manual ledger adjustments.',
    permissions: [
      PERMISSIONS.DEPOSITS_VIEW,
      PERMISSIONS.DEPOSITS_APPROVE,
      PERMISSIONS.WITHDRAWALS_VIEW,
      PERMISSIONS.WITHDRAWALS_APPROVE,
      PERMISSIONS.WALLET_VIEW,
      PERMISSIONS.WALLET_ADJUST,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
  {
    key: ROLES.RISK,
    description: 'Risk & compliance — reviews KYC, restricts accounts, audits activity.',
    permissions: [
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_SUSPEND,
      PERMISSIONS.KYC_VIEW,
      PERMISSIONS.KYC_REVIEW,
      PERMISSIONS.BETS_VIEW,
      PERMISSIONS.WALLET_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.AUDIT_VIEW,
    ],
  },
  {
    key: ROLES.ADMIN,
    description: 'Platform operations — manages users, markets, and settlement, short of payments/roles.',
    permissions: [
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_UPDATE,
      PERMISSIONS.USERS_SUSPEND,
      PERMISSIONS.KYC_VIEW,
      PERMISSIONS.KYC_REVIEW,
      PERMISSIONS.DEPOSITS_VIEW,
      PERMISSIONS.WITHDRAWALS_VIEW,
      PERMISSIONS.WALLET_VIEW,
      PERMISSIONS.BETS_VIEW,
      PERMISSIONS.BETS_SETTLE,
      PERMISSIONS.MARKETS_VIEW,
      PERMISSIONS.MARKETS_MANAGE,
      PERMISSIONS.ODDS_MANAGE,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.AUDIT_VIEW,
    ],
  },
  {
    key: ROLES.SUPER_ADMIN,
    description: 'Full platform authority, including role/permission and settings management.',
    permissions: ALL_PERMISSIONS,
  },
];

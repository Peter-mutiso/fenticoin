import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Bell,
  ClipboardList,
  Coins,
  FileClock,
  Gauge,
  Gift,
  KeyRound,
  Landmark,
  LineChart,
  Lock,
  Receipt,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  /** Nav item is hidden unless the current admin holds this permission. Omit for informational/notice-only pages that are safe to show anyone with admin access at all. */
  permission?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: Gauge, href: '/dashboard', permission: 'reports.view' }],
  },
  {
    label: 'Users & compliance',
    items: [
      { id: 'users', label: 'Users', icon: Users, href: '/users', permission: 'users.view' },
      { id: 'kyc', label: 'KYC', icon: ShieldCheck, href: '/kyc', permission: 'kyc.view' },
      { id: 'risk', label: 'Risk management', icon: ShieldAlert, href: '/risk', permission: 'bets.view' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { id: 'deposits', label: 'Deposits', icon: Landmark, href: '/deposits', permission: 'deposits.view' },
      { id: 'withdrawals', label: 'Withdrawals', icon: Coins, href: '/withdrawals', permission: 'withdrawals.view' },
      { id: 'wallets', label: 'Wallets', icon: Wallet, href: '/wallets', permission: 'wallet.view' },
      { id: 'transactions', label: 'Transactions', icon: Receipt, href: '/transactions', permission: 'wallet.view' },
      { id: 'bonuses', label: 'Bonuses', icon: Gift, href: '/bonuses', permission: 'wallet.adjust' },
    ],
  },
  {
    label: 'Trading',
    items: [
      { id: 'bets', label: 'Bets', icon: Activity, href: '/bets', permission: 'bets.view' },
      { id: 'markets', label: 'Markets & instruments', icon: TrendingUp, href: '/markets', permission: 'markets.view' },
      { id: 'odds', label: 'Odds & betting configuration', icon: LineChart, href: '/betting/configs', permission: 'markets.view' },
    ],
  },
  {
    label: 'Growth',
    items: [
      { id: 'referrals', label: 'Referrals', icon: Award, href: '/referrals' },
      { id: 'notifications', label: 'Notifications', icon: Bell, href: '/notifications' },
    ],
  },
  {
    label: 'Reporting',
    items: [
      { id: 'reports', label: 'Reports & analytics', icon: BarChart3, href: '/reports', permission: 'reports.view' },
      { id: 'audit-logs', label: 'Audit logs', icon: ScrollText, href: '/audit-logs', permission: 'audit.view' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'admin-users', label: 'Admin users', icon: ClipboardList, href: '/admin-users', permission: 'roles.manage' },
      { id: 'roles', label: 'Roles', icon: KeyRound, href: '/roles', permission: 'roles.manage' },
      { id: 'permissions', label: 'Permissions', icon: Lock, href: '/permissions', permission: 'roles.manage' },
      { id: 'settings-site', label: 'Site settings', icon: Settings, href: '/settings/site', permission: 'settings.manage' },
      { id: 'settings-security', label: 'Security settings', icon: FileClock, href: '/settings/security', permission: 'settings.manage' },
      { id: 'settings-rg', label: 'Responsible gambling', icon: AlertTriangle, href: '/settings/responsible-gambling', permission: 'settings.manage' },
    ],
  },
];

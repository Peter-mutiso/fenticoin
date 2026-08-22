import { Briefcase, Clock, Home, LineChart, Receipt, TrendingUp, User, type LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** The central, emphasized entry point into trading/betting — rendered distinctly in the bottom nav. */
  primary?: boolean;
  /** Real route. Items without one are still displayed but don't navigate anywhere yet. */
  href?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home, href: '/dashboard' },
  { id: 'markets', label: 'Markets', icon: TrendingUp, href: '/markets' },
  { id: 'trade', label: 'Trade', icon: LineChart, primary: true, href: '/dashboard' },
  { id: 'portfolio', label: 'Portfolio', icon: Briefcase, href: '/portfolio' },
  { id: 'history', label: 'History', icon: Clock, href: '/bet-history' },
  { id: 'transactions', label: 'Transactions', icon: Receipt, href: '/transactions' },
  { id: 'account', label: 'Account', icon: User, href: '/account' },
];

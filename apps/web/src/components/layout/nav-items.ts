import { Bot, Clock, Home, LineChart, TrendingUp, type LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** The central, emphasized entry point into trading/betting — rendered distinctly in the bottom nav. */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'markets', label: 'Markets', icon: TrendingUp },
  { id: 'trade', label: 'Trade', icon: LineChart, primary: true },
  { id: 'futures', label: 'Futures', icon: Clock },
  { id: 'bot', label: 'Bot', icon: Bot },
];

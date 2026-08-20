'use client';

import { useState } from 'react';

import type { PortfolioSummary } from '@/types/market';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { NAV_ITEMS } from './nav-items';
import { SidebarNav } from './SidebarNav';

export function AppShell({
  portfolio,
  children,
}: {
  portfolio: PortfolioSummary;
  children: React.ReactNode;
}) {
  // Purely a visual "which tab is highlighted" state — none of these tabs
  // route anywhere real yet (Markets/Futures/Bot have no pages built).
  const [activeId, setActiveId] = useState('home');

  return (
    <div className="min-h-screen bg-white">
      <SidebarNav items={NAV_ITEMS} activeId={activeId} onSelect={setActiveId} />

      <div className="lg:pl-60 xl:pl-64">
        <Header portfolio={portfolio} />

        <main className="mx-auto max-w-3xl px-4 pb-24 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>

      <BottomNav items={NAV_ITEMS} activeId={activeId} onSelect={setActiveId} />
    </div>
  );
}

'use client';

import { Wallet } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { UserSearchLauncher } from '@/components/finance/UserSearchLauncher';

export default function WalletsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Wallets</h1>
        <p className="mt-1 text-sm text-neutral-500">Wallet balances are viewed per-user — search to open a wallet.</p>
        <div className="mt-5">
          <UserSearchLauncher targetTab="Wallet" icon={Wallet} placeholder="Search by email to view a wallet…" />
        </div>
      </div>
    </AdminShell>
  );
}

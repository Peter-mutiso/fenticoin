'use client';

import { Receipt } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { UserSearchLauncher } from '@/components/finance/UserSearchLauncher';

export default function TransactionsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="mt-1 text-sm text-neutral-500">Ledger transactions (deposits, withdrawals, bets, bonuses, adjustments, fees, reversals) are viewed per-user — search to open a ledger.</p>
        <div className="mt-5">
          <UserSearchLauncher targetTab="Transactions" icon={Receipt} placeholder="Search by email to view transactions…" />
        </div>
      </div>
    </AdminShell>
  );
}

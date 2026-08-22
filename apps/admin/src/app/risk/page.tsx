'use client';

import { Search } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { RiskQueue } from '@/components/betting/RiskQueue';
import { NotImplementedNotice } from '@/components/ui/NotImplementedNotice';
import { UserSearchLauncher } from '@/components/finance/UserSearchLauncher';

export default function RiskPage() {
  return (
    <AdminShell>
      <div className="space-y-6 pb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Risk management</h1>
          <p className="mt-1 text-sm text-neutral-500">Bets flagged for manual review after repeated automated settlement failures.</p>
          <div className="mt-5">
            <RiskQueue />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-neutral-900">Restrict an account</h2>
          <p className="mt-1 text-sm text-neutral-500">Search for a user to restrict their betting/deposits/withdrawals from their account page.</p>
          <div className="mt-3">
            <UserSearchLauncher targetTab="Overview" icon={Search} placeholder="Search by email…" />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-neutral-900">Risk scoring</h2>
          <div className="mt-2">
            <NotImplementedNotice
              title="Automated risk scoring isn't available yet"
              description="There is no user-level risk-scoring or case-management system beyond the bet-level review queue above and manual account restriction."
            />
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

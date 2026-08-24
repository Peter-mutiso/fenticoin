'use client';

import Link from 'next/link';

import { useAuth } from '@/lib/auth/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { BettingExperience } from '@/components/betting/BettingExperience';
import { BalanceCard } from '@/components/wallet/BalanceCard';
import { FeaturedInstruments } from './FeaturedInstruments';

export function HomeDashboard() {
  const { status: authStatus } = useAuth();
  const balance = useWalletBalance();

  return (
    <div className="space-y-6 pb-8 max-w-xl mx-auto">
      {authStatus === 'authenticated' ? (
        <div className="space-y-4">
          {balance.data && (
            <BalanceCard availableMinorUnits={balance.data.availableMinorUnits} lockedMinorUnits={balance.data.lockedMinorUnits} currency={balance.data.currency} showLocked />
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
          <p className="text-sm font-semibold text-brand-700">Log in to see your balance and quick actions.</p>
          <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
            Log in
          </Link>
        </div>
      )}

      <FeaturedInstruments />

      <BettingExperience />
    </div>
  );
}
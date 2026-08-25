'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';

import { listInstruments, getPrice, getBettingConfig, placeBet } from '@/lib/api-client';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useAuth } from '@/lib/auth/AuthContext';
import { describeApiError } from '@/lib/api-errors';
import { Notice } from '@/components/ui/Notice';

export function BettingExperience() {
  const { status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const balance = useWalletBalance();

  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>('');
  const [stake, setStake] = useState<string>('');
  const [direction, setDirection] = useState<'rise' | 'fall'>('rise');
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [successNotice, setSuccessNotice] = useState<boolean>(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Queries
  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: () => listInstruments() });
  const instruments = instrumentsQuery.data?.items ?? [];

  const priceQuery = useQuery({
    queryKey: ['price', selectedInstrumentId],
    queryFn: () => getPrice(selectedInstrumentId),
    enabled: !!selectedInstrumentId,
    refetchInterval: 5000,
  });

  const configQuery = useQuery({
    queryKey: ['betting-config', selectedInstrumentId],
    queryFn: () => getBettingConfig(selectedInstrumentId, 'rise_fall'),
    enabled: !!selectedInstrumentId,
  });

  // Place Bet Mutation
  const placeBetMutation = useMutation({
    mutationFn: async () => {
      const stakeNumber = parseFloat(stake);
      const stakeMinorUnits = Math.round(stakeNumber * 100).toString();
      return placeBet({
        instrumentId: selectedInstrumentId,
        type: 'rise_fall',
        selection: direction,
        stakeAmount: stakeMinorUnits,
        currency: 'USD',
        durationSeconds: 30,
      });
    },
    onSuccess: () => {
      setDialogError(null);
      setIsReviewOpen(false);
      setSuccessNotice(true);
      setStake('');
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      setTimeout(() => setSuccessNotice(false), 4000);
    },
    onError: (err: any) => {
      setDialogError(describeApiError(err).title || 'An error occurred');
    },
  });

  if (authStatus !== 'authenticated') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
        <p className="text-sm font-semibold text-brand-700">Log in to see live odds and place predictions.</p>
        <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
          Log in
        </Link>
      </div>
    );
  }

  const selectedInstrument = instruments.find((i) => i.id === selectedInstrumentId);
  const config = configQuery.data;
  const payoutBasisPoints = config ? parseInt(config.payoutRateBasisPoints, 10) : 8500;
  const payoutMultiplier = payoutBasisPoints / 10000;
  const stakeNum = parseFloat(stake) || 0;
  const potentialPayout = (stakeNum * payoutMultiplier).toFixed(2);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">FentiCoin Markets</span>
          <h2 className="text-2xl font-extrabold text-neutral-900">Make a prediction</h2>
        </div>
        {balance.data && (
          <div className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white">
            Available: ${balance.data.available}
          </div>
        )}
      </div>

      {successNotice && <Notice text="Bet confirmed successfully!" className="bg-emerald-50 text-emerald-800 border-emerald-200" />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Controls */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">1. Choose a market</span>
            <div>
              <label htmlFor="instrument-select" className="block text-xs font-bold text-neutral-700 mb-1.5">Instrument</label>
              <select
                id="instrument-select"
                aria-label="Instrument"
                value={selectedInstrumentId}
                onChange={(e) => setSelectedInstrumentId(e.target.value)}
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-3.5 text-sm font-semibold text-neutral-900 outline-none focus:border-emerald-500 focus:bg-white transition"
              >
                <option value="">Select an instrument</option>
                {instruments.map((inst) => {
                  const isClosed = inst.status !== 'active';
                  return (
                    <option key={inst.id} value={inst.id} disabled={isClosed}>
                      {inst.displaySymbol} — {inst.name} {isClosed ? '(Closed)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">2. Pick your direction</span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDirection('rise')}
                className={`flex items-center justify-center gap-2 rounded-2xl py-4 font-bold text-sm transition shadow-sm ${
                  direction === 'rise' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <TrendingUp className="h-4 w-4" /> Rise
              </button>
              <button
                type="button"
                onClick={() => setDirection('fall')}
                className={`flex items-center justify-center gap-2 rounded-2xl py-4 font-bold text-sm transition shadow-sm ${
                  direction === 'fall' ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <TrendingDown className="h-4 w-4" /> Fall
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1.5">Stake (USD)</label>
              <input
                type="text"
                placeholder="0.00"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3 px-4 text-sm font-bold text-neutral-900 outline-none focus:border-emerald-500 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Summary Card */}
        <div className="rounded-3xl bg-neutral-950 p-6 text-white shadow-xl space-y-6 sticky top-6">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
            <div>
              <span className="text-[10px] font-bold tracking-widest uppercase text-neutral-400">Bet summary</span>
              <h3 className="text-lg font-extrabold mt-0.5">Rise / Fall</h3>
            </div>
            <Zap className="h-5 w-5 text-emerald-400" />
          </div>

          <div className="space-y-4 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-neutral-400">Direction</span>
              <span className={`font-bold uppercase ${direction === 'rise' ? 'text-emerald-400' : 'text-red-400'}`}>{direction}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-400">Stake</span>
              <span className="font-bold">${stakeNum.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-400">Duration</span>
              <span className="font-bold">30s</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-400">Payout rate (est.)</span>
              <span className="font-bold text-emerald-400">{(payoutMultiplier * 100).toFixed(0)}%</span>
            </div>
            <div className="border-t border-neutral-800 pt-3 flex justify-between items-center">
              <span className="text-neutral-300 font-semibold">Potential return</span>
              <span className="text-lg font-extrabold text-emerald-400">${stakeNum > 0 ? potentialPayout : '—'}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={!selectedInstrumentId || stakeNum <= 0}
            onClick={() => {
              setDialogError(null);
              setIsReviewOpen(true);
            }}
            className="w-full rounded-2xl bg-emerald-500 py-4 font-bold text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <ShieldCheck className="h-4 w-4" /> Review bet
          </button>
        </div>
      </div>

      {/* Review Dialog Modal */}
      {isReviewOpen && (
        <div role="dialog" aria-label="Review bet" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-neutral-900 p-6 text-white shadow-2xl border border-neutral-800 space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-lg font-bold">Review bet</h3>
              <button onClick={() => setIsReviewOpen(false)} className="text-neutral-400 hover:text-white">✕</button>
            </div>

            {dialogError && <Notice text={dialogError} className="bg-red-500/10 text-red-400 border-red-500/20" />}

            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-neutral-400">Instrument</span><span className="font-bold">{selectedInstrument?.displaySymbol}</span></div>
              <div className="flex justify-between"><span className="text-neutral-400">Direction</span><span className="font-bold uppercase">{direction}</span></div>
              <div className="flex justify-between"><span className="text-neutral-400">Stake</span><span className="font-bold">${stakeNum.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-400">Live Price</span><span className="font-bold">${priceQuery.data?.price ?? '—'}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                className="rounded-2xl bg-neutral-800 py-3 font-semibold text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={placeBetMutation.isPending}
                onClick={() => placeBetMutation.mutate()}
                className="rounded-2xl bg-emerald-500 py-3 font-bold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {placeBetMutation.isPending ? 'Confirming...' : 'Confirm bet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
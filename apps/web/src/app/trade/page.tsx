'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Zap, ShieldCheck, Activity, Clock, DollarSign, AlertCircle } from 'lucide-react';
import Link from 'next/link';

import { AppShell } from '@/components/layout/AppShell';
import { listInstruments, getPrice, getBettingConfig, placeBet } from '@/lib/api-client';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useAuth } from '@/lib/auth/AuthContext';
import { describeApiError } from '@/lib/api-errors';
import { parseStakeToMinorUnits } from '@/lib/money';
import { Notice } from '@/components/ui/Notice';

export default function TradePage() {
  const { status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const balance = useWalletBalance();

  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>('');
  const [stake, setStake] = useState<string>('');
  const [direction, setDirection] = useState<'rise' | 'fall'>('rise');
  const [duration, setDuration] = useState<number>(30);
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [successNotice, setSuccessNotice] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Queries
  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: () => listInstruments() });
  const instruments = instrumentsQuery.data?.items ?? [];

  const selectedInstrument = instruments.find((i) => i.id === selectedInstrumentId);

  const priceQuery = useQuery({
    queryKey: ['price', selectedInstrumentId],
    queryFn: () => getPrice(selectedInstrumentId),
    enabled: !!selectedInstrumentId,
    refetchInterval: 3000,
  });

  const configQuery = useQuery({
    queryKey: ['betting-config', selectedInstrumentId],
    queryFn: () => getBettingConfig(selectedInstrumentId, 'rise_fall'),
    enabled: !!selectedInstrumentId,
  });

  // Place Bet Mutation with detailed error extraction
  const placeBetMutation = useMutation({
    mutationFn: async () => {
      const currency = selectedInstrument?.quoteCurrency ?? 'USD';
      let stakeMinorUnits: bigint;
      try {
        stakeMinorUnits = parseStakeToMinorUnits(stake, currency);
      } catch {
        throw new Error('Please enter a valid stake amount.');
      }
      if (stakeMinorUnits <= 0n) {
        throw new Error('Please enter a valid stake amount.');
      }

      return placeBet({
        instrumentId: selectedInstrumentId,
        type: 'rise_fall',
        selection: direction,
        stakeAmount: stakeMinorUnits.toString(),
        currency,
        durationSeconds: duration,
      });
    },
    onSuccess: () => {
      setActionError(null);
      setIsReviewOpen(false);
      setSuccessNotice(true);
      setStake('');
      
      // Invalidate relevant caches to instantly refresh balances and open portfolio positions
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['bets'] });

      setTimeout(() => setSuccessNotice(false), 5000);
    },
    onError: (err: any) => {
      const descriptive = describeApiError(err);
      setActionError(descriptive.title || err.message || 'Execution failed. Check balance or market status.');
    },
  });

  const payoutBasisPoints = configQuery.data ? parseInt(configQuery.data.payoutRateBasisPoints, 10) : 8500;
  const payoutMultiplier = payoutBasisPoints / 10000;
  const stakeNum = parseFloat(stake) || 0;
  const potentialPayout = (stakeNum * payoutMultiplier).toFixed(2);

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto space-y-6 pb-16">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Live Prediction Terminal</span>
            </div>
            <h1 className="text-3xl font-extrabold text-neutral-900 mt-1">Trading Workspace</h1>
          </div>

          {balance.data && (
            <div className="flex items-center gap-3 bg-neutral-900 text-white px-5 py-2.5 rounded-2xl shadow-sm">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">Available Balance</p>
                <p className="text-sm font-extrabold">${balance.data.available}</p>
              </div>
            </div>
          )}
        </div>

        {authStatus !== 'authenticated' && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
            <p className="text-sm font-semibold text-brand-700">Log in to execute live orders and track positions.</p>
            <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
              Log in
            </Link>
          </div>
        )}

        {successNotice && <Notice text="Prediction order executed successfully! Check your portfolio for live tracking." className="bg-emerald-50 text-emerald-800 border-emerald-200" />}
        {actionError && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-50 p-4 text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-semibold">{actionError}</p>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Left Column: Instruments & Price Feed */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Select Market Instrument</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {instrumentsQuery.isLoading ? (
                  <div className="col-span-full h-12 animate-pulse bg-neutral-100 rounded-2xl" />
                ) : (
                  instruments.map((inst) => {
                    const isSelected = inst.id === selectedInstrumentId;
                    const isClosed = inst.status !== 'active';
                    return (
                      <button
                        key={inst.id}
                        type="button"
                        disabled={isClosed}
                        onClick={() => setSelectedInstrumentId(inst.id)}
                        className={`flex flex-col items-start p-4 rounded-2xl border transition text-left ${
                          isSelected 
                            ? 'border-neutral-900 bg-neutral-900 text-white shadow-md' 
                            : 'border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-300'
                        } ${isClosed ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className="text-xs font-bold uppercase tracking-wide opacity-75">{inst.categoryKey}</span>
                        <span className="text-base font-extrabold mt-1">{inst.displaySymbol}</span>
                        <span className={`text-[10px] mt-2 px-2 py-0.5 rounded-full font-bold ${isSelected ? 'bg-neutral-800 text-emerald-400' : 'bg-neutral-200 text-neutral-700'}`}>
                          {inst.name}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Live Chart Visualizer Box */}
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-emerald-500" />
                  <h3 className="text-base font-bold text-neutral-900">
                    {selectedInstrument ? `${selectedInstrument.displaySymbol} Live Price Feed` : 'Select an instrument'}
                  </h3>
                </div>
                {priceQuery.data && (
                  <span className="text-xl font-extrabold text-neutral-900">
                    ${priceQuery.data.price}
                  </span>
                )}
              </div>

              <div className="h-64 rounded-2xl bg-neutral-950 flex flex-col items-center justify-center p-6 text-center text-neutral-400 relative overflow-hidden">
                {selectedInstrumentId ? (
                  <div className="space-y-2 z-10">
                    <p className="text-xs uppercase tracking-widest text-emerald-400 font-bold">Stream Connected</p>
                    <p className="text-3xl font-black text-white">${priceQuery.data?.price ?? 'Fetching...'}</p>
                    <p className="text-xs text-neutral-400">Refreshing every 3 seconds</p>
                  </div>
                ) : (
                  <div className="space-y-2 z-10">
                    <p className="text-sm font-semibold text-neutral-300">No market selected</p>
                    <p className="text-xs text-neutral-500">Choose an asset above to view live quotes.</p>
                  </div>
                )}
                <div className="absolute inset-0 bg-[radial-gradient(#262626_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />
              </div>
            </div>
          </div>

          {/* Right Column: Order Execution Ticket */}
          <div className="rounded-3xl bg-neutral-950 p-6 text-white shadow-2xl space-y-6 sticky top-6">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-neutral-400">Order Ticket</span>
                <h3 className="text-lg font-extrabold mt-0.5">Rise / Fall Contract</h3>
              </div>
              <Zap className="h-5 w-5 text-emerald-400" />
            </div>

            <div className="space-y-5">
              {/* Direction selector */}
              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-2 uppercase tracking-wider">Prediction</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDirection('rise')}
                    className={`flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-sm transition shadow-sm ${
                      direction === 'rise' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                    }`}
                  >
                    <TrendingUp className="h-4 w-4" /> Rise
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('fall')}
                    className={`flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-sm transition shadow-sm ${
                      direction === 'fall' ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                    }`}
                  >
                    <TrendingDown className="h-4 w-4" /> Fall
                  </button>
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-2 uppercase tracking-wider">Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {[30, 60, 300].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setDuration(sec)}
                      className={`rounded-xl py-2.5 text-xs font-bold transition flex items-center justify-center gap-1 ${
                        duration === sec ? 'bg-neutral-800 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                      }`}
                    >
                      <Clock className="h-3 w-3" /> {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stake input */}
              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-2 uppercase tracking-wider">Stake Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 py-3.5 px-4 text-sm font-bold text-white outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="space-y-3 pt-3 border-t border-neutral-800 text-sm">
                <div className="flex justify-between items-center text-neutral-400">
                  <span>Payout Rate</span>
                  <span className="font-bold text-emerald-400">{(payoutMultiplier * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between items-center text-neutral-300">
                  <span>Potential Return</span>
                  <span className="text-lg font-extrabold text-emerald-400">${stakeNum > 0 ? potentialPayout : '0.00'}</span>
                </div>
              </div>

              <button
                type="button"
                disabled={!selectedInstrumentId || stakeNum <= 0 || authStatus !== 'authenticated'}
                onClick={() => {
                  setActionError(null);
                  setIsReviewOpen(true);
                }}
                className="w-full rounded-2xl bg-emerald-500 py-4 font-bold text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <ShieldCheck className="h-4 w-4" /> Place Prediction
              </button>
            </div>
          </div>
        </div>

        {/* Confirmation Modal */}
        {isReviewOpen && (
          <div role="dialog" aria-label="Review order" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-neutral-900 p-6 text-white shadow-2xl border border-neutral-800 space-y-5">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <h3 className="text-lg font-bold">Review Contract Order</h3>
                <button onClick={() => setIsReviewOpen(false)} className="text-neutral-400 hover:text-white">✕</button>
              </div>

              {actionError && <Notice text={actionError} className="bg-red-500/10 text-red-400 border-red-500/20" />}

              <div className="space-y-3 text-sm bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                <div className="flex justify-between"><span className="text-neutral-400">Instrument</span><span className="font-bold text-white">{selectedInstrument?.displaySymbol}</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">Direction</span><span className={`font-bold uppercase ${direction === 'rise' ? 'text-emerald-400' : 'text-red-400'}`}>{direction}</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">Stake</span><span className="font-bold text-white">${stakeNum.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">Duration</span><span className="font-bold text-white">{duration}s</span></div>
                <div className="flex justify-between border-t border-neutral-800 pt-2"><span className="text-neutral-400">Entry Price</span><span className="font-bold text-emerald-400">${priceQuery.data?.price ?? '—'}</span></div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReviewOpen(false)}
                  className="rounded-2xl bg-neutral-800 py-3 font-semibold text-neutral-300 hover:bg-neutral-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={placeBetMutation.isPending}
                  onClick={() => placeBetMutation.mutate()}
                  className="rounded-2xl bg-emerald-500 py-3 font-bold text-neutral-950 hover:bg-emerald-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {placeBetMutation.isPending ? 'Executing...' : 'Confirm Order'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
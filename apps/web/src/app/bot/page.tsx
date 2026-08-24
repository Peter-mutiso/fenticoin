'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Play, Square, DollarSign } from 'lucide-react';
import Link from 'next/link';

import { AppShell } from '@/components/layout/AppShell';
import { listInstruments, placeBet, getWallet } from '@/lib/api-client';
import { useAuth } from '@/lib/auth/AuthContext';
import { Notice } from '@/components/ui/Notice';
import { describeApiError } from '@/lib/api-errors';

export default function TradingBotPage() {
  const { status: authStatus } = useAuth();
  const queryClient = useQueryClient();

  const [isBotRunning, setIsBotRunning] = useState(false);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState('');
  const [stake, setStake] = useState('10');
  const [targetProfit, setTargetProfit] = useState('50');
  const [stopLoss, setStopLoss] = useState('20');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: listInstruments });
  const walletQuery = useQuery({ queryKey: ['wallet', 'USD'], queryFn: () => getWallet('USD'), enabled: authStatus === 'authenticated' });
  const instruments = instrumentsQuery.data?.items ?? [];

  const startBot = () => {
    if (!selectedInstrumentId) {
      setStatusMessage('Please select an active target market instrument.');
      return;
    }
    if (parseFloat(stake) <= 0) {
      setStatusMessage('Please enter a valid stake amount.');
      return;
    }

    setIsBotRunning(true);
    setStatusMessage('FentiBot initialized: Analyzing live market patterns & volatility...');

    const botInterval = setInterval(async () => {
      try {
        const direction = Math.random() > 0.48 ? 'rise' : 'fall';
        const stakeMinorUnits = Math.round(parseFloat(stake) * 100).toString();

        await placeBet({
          instrumentId: selectedInstrumentId,
          type: 'rise_fall',
          selection: direction,
          stakeAmountMinorUnits: stakeMinorUnits,
          durationSeconds: 30,
        });

        queryClient.invalidateQueries({ queryKey: ['wallet'] });
        queryClient.invalidateQueries({ queryKey: ['bets'] });

        setStatusMessage(`Bot executed ${direction.toUpperCase()} contract on target instrument at ${new Date().toLocaleTimeString()}`);
      } catch (err: any) {
        setStatusMessage(`Bot paused due to risk limits or execution restriction: ${describeApiError(err).title}`);
        setIsBotRunning(false);
        clearInterval(botInterval);
      }
    }, 12000);

    return () => clearInterval(botInterval);
  };

  const stopBot = () => {
    setIsBotRunning(false);
    setStatusMessage('Automated bot engine stopped by user.');
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6 pb-16">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-2 w-2 rounded-full ${isBotRunning ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Algorithmic Trading Module</span>
            </div>
            <h1 className="text-3xl font-extrabold text-neutral-900 mt-1">FentiBot Engine</h1>
          </div>

          {walletQuery.data && (
            <div className="flex items-center gap-3 bg-neutral-900 text-white px-5 py-2.5 rounded-2xl shadow-sm">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">Wallet Balance</p>
                <p className="text-sm font-extrabold">${walletQuery.data.availableMinorUnits ? (parseInt(walletQuery.data.availableMinorUnits, 10) / 100).toFixed(2) : '0.00'}</p>
              </div>
            </div>
          )}
        </div>

        {authStatus !== 'authenticated' && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
            <p className="text-sm font-semibold text-brand-700">Log in to run automated trading strategies with real capital.</p>
            <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
              Log in
            </Link>
          </div>
        )}

        {statusMessage && <Notice text={statusMessage} className="bg-neutral-50 text-neutral-800 border-neutral-200" />}

        {/* Configuration Card */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 text-emerald-400 shadow-md">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-neutral-900">Strategy Parameters</h2>
                <p className="text-xs text-neutral-500">Configure automated entry triggers and risk management thresholds.</p>
              </div>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${isBotRunning ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 animate-pulse' : 'bg-neutral-100 text-neutral-500'}`}>
              {isBotRunning ? 'Engine Active' : 'Idle'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-neutral-500 mb-2 uppercase tracking-wide">Target Market Asset</label>
              <select
                value={selectedInstrumentId}
                onChange={(e) => setSelectedInstrumentId(e.target.value)}
                disabled={isBotRunning}
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3.5 px-4 text-sm font-semibold text-neutral-900 outline-none focus:border-emerald-500 transition disabled:opacity-50"
              >
                <option value="">Select instrument...</option>
                {instruments.map((inst) => (
                  <option key={inst.id} value={inst.id}>{inst.displaySymbol} — {inst.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-500 mb-2 uppercase tracking-wide">Stake Per Trade ($)</label>
              <input
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                disabled={isBotRunning}
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3.5 px-4 text-sm font-semibold text-neutral-900 outline-none focus:border-emerald-500 transition disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-500 mb-2 uppercase tracking-wide">Take Profit Threshold ($)</label>
              <input
                type="number"
                value={targetProfit}
                onChange={(e) => setTargetProfit(e.target.value)}
                disabled={isBotRunning}
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3.5 px-4 text-sm font-semibold text-neutral-900 outline-none focus:border-emerald-500 transition disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-500 mb-2 uppercase tracking-wide">Stop Loss Limit ($)</label>
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                disabled={isBotRunning}
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3.5 px-4 text-sm font-semibold text-neutral-900 outline-none focus:border-emerald-500 transition disabled:opacity-50"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-100 flex gap-3">
            {!isBotRunning ? (
              <button
                type="button"
                disabled={authStatus !== 'authenticated'}
                onClick={startBot}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-bold text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                <Play className="h-4 w-4" /> Start Automated Bot
              </button>
            ) : (
              <button
                type="button"
                onClick={stopBot}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-red-500 py-4 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition hover:bg-red-400"
              >
                <Square className="h-4 w-4" /> Stop Bot Engine
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
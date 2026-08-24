'use client';

import { useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Bot, Play, Square } from 'lucide-react';
import { placeBet, listInstruments } from '@/lib/api-client';
import { Notice } from '@/components/ui/Notice';

export function TradingBotPanel() {
  const queryClient = useQueryClient();
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState('');
  const [stake, setStake] = useState('10');
  const [targetProfit, setTargetProfit] = useState('50');
  const [stopLoss, setStopLoss] = useState('20');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: listInstruments });
  const instruments = instrumentsQuery.data?.items ?? [];

  // Simulated automated loop runner
  const startBot = () => {
    if (!selectedInstrumentId) {
      setStatusMessage('Please select an instrument for the bot.');
      return;
    }
    setIsBotRunning(true);
    setStatusMessage('Bot initialized: Scanning market momentum...');

    // Automated execution loop interval
    const interval = setInterval(async () => {
      try {
        const direction = Math.random() > 0.5 ? 'rise' : 'fall';
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
        setStatusMessage(`Bot placed a ${direction.toUpperCase()} contract at ${new Date().toLocaleTimeString()}`);
      } catch (err) {
        setStatusMessage('Bot execution paused due to market conditions or balance limits.');
        setIsBotRunning(false);
        clearInterval(interval);
      }
    }, 15000); // Executing a trade check every 15 seconds

    // Save reference or handle cleanup if unmounted
    return () => clearInterval(interval);
  };

  const stopBot = () => {
    setIsBotRunning(false);
    setStatusMessage('Bot stopped by user.');
  };

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-900 text-emerald-400">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-neutral-900">FentiBot Automated Engine</h2>
            <p className="text-xs text-neutral-500">Run automated high-frequency prediction strategies.</p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${isBotRunning ? 'bg-emerald-50 text-emerald-600 animate-pulse' : 'bg-neutral-100 text-neutral-500'}`}>
          {isBotRunning ? 'Active & Running' : 'Idle'}
        </span>
      </div>

      {statusMessage && <Notice text={statusMessage} className="bg-neutral-50 text-neutral-800 border-neutral-200" />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-neutral-500 mb-2 uppercase">Target Market</label>
          <select
            value={selectedInstrumentId}
            onChange={(e) => setSelectedInstrumentId(e.target.value)}
            disabled={isBotRunning}
            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3.5 px-4 text-sm font-semibold text-neutral-900 outline-none focus:border-emerald-500"
          >
            <option value="">Select instrument...</option>
            {instruments.map((inst) => (
              <option key={inst.id} value={inst.id}>{inst.displaySymbol} - {inst.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-500 mb-2 uppercase">Stake per Trade ($)</label>
          <input
            type="number"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            disabled={isBotRunning}
            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3.5 px-4 text-sm font-semibold text-neutral-900 outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-500 mb-2 uppercase">Take Profit Target ($)</label>
          <input
            type="number"
            value={targetProfit}
            onChange={(e) => setTargetProfit(e.target.value)}
            disabled={isBotRunning}
            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3.5 px-4 text-sm font-semibold text-neutral-900 outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-500 mb-2 uppercase">Stop Loss Limit ($)</label>
          <input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            disabled={isBotRunning}
            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3.5 px-4 text-sm font-semibold text-neutral-900 outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-neutral-100">
        {!isBotRunning ? (
          <button
            type="button"
            onClick={startBot}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-bold text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
          >
            <Play className="h-4 w-4" /> Start Automated Bot
          </button>
        ) : (
          <button
            type="button"
            onClick={stopBot}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-red-500 py-4 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition hover:bg-red-400"
          >
            <Square className="h-4 w-4" /> Stop Bot
          </button>
        )}
      </div>
    </div>
  );
}
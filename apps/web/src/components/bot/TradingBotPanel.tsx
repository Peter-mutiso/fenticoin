'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Play, Square } from 'lucide-react';
import { activateBot, deactivateBot, getBot } from '@/lib/api-client';
import { Notice } from '@/components/ui/Notice';

export function TradingBotPanel() {
  const queryClient = useQueryClient();
  const botQuery = useQuery({ queryKey: ['bot'], queryFn: getBot });
  const activateMutation = useMutation({ mutationFn: activateBot, onSuccess: (bot) => queryClient.setQueryData(['bot'], bot) });
  const deactivateMutation = useMutation({ mutationFn: deactivateBot, onSuccess: (bot) => queryClient.setQueryData(['bot'], bot) });
  const bot = botQuery.data;
  const status = bot?.status ?? 'inactive';
  const isBusy = activateMutation.isPending || deactivateMutation.isPending;

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
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${status === 'active' ? 'bg-emerald-50 text-emerald-600 animate-pulse' : 'bg-neutral-100 text-neutral-500'}`}>
          {status === 'strategy_unconfigured' ? 'Strategy not configured' : status === 'active' ? 'Active' : 'Inactive'}
        </span>
      </div>

      {botQuery.error && <Notice text="Unable to load bot state." />}
      {botQuery.isPending && <p className="text-sm text-neutral-500">Loading bot state...</p>}
      {status === 'strategy_unconfigured' && <Notice text="No trading strategy has been configured yet." />}
      {activateMutation.error && <Notice text="Bot activation failed." />}
      {deactivateMutation.error && <Notice text="Bot deactivation failed." />}

      <div className="flex gap-3 pt-4 border-t border-neutral-100">
        {status !== 'active' ? (
          <button
            type="button"
            disabled={isBusy || status === 'strategy_unconfigured'}
            onClick={() => activateMutation.mutate()}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-bold text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
          >
            <Play className="h-4 w-4" /> Activate Bot
          </button>
        ) : (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => deactivateMutation.mutate()}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-red-500 py-4 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition hover:bg-red-400"
          >
            <Square className="h-4 w-4" /> Deactivate Bot
          </button>
        )}
      </div>
    </div>
  );
}
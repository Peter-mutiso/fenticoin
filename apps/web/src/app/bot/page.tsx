'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Play, Square } from 'lucide-react';
import Link from 'next/link';

import { AppShell } from '@/components/layout/AppShell';
import { activateBot, deactivateBot, getBot } from '@/lib/api-client';
import { useAuth } from '@/lib/auth/AuthContext';
import { Notice } from '@/components/ui/Notice';
import { describeApiError } from '@/lib/api-errors';

export default function TradingBotPage() {
  const { status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const botQuery = useQuery({ queryKey: ['bot'], queryFn: getBot, enabled: authStatus === 'authenticated' });
  const activateMutation = useMutation({
    mutationFn: activateBot,
    onSuccess: (bot) => queryClient.setQueryData(['bot'], bot),
  });
  const deactivateMutation = useMutation({
    mutationFn: deactivateBot,
    onSuccess: (bot) => queryClient.setQueryData(['bot'], bot),
  });
  const bot = botQuery.data;
  const isBusy = activateMutation.isPending || deactivateMutation.isPending;
  const status = bot?.status ?? 'inactive';
  const statusText = status === 'strategy_unconfigured' ? 'Strategy not configured' : status === 'active' ? 'Active' : 'Inactive';
  const actionError = activateMutation.error ?? deactivateMutation.error ?? botQuery.error;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6 pb-16">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-5">
          <div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-2 w-2 rounded-full ${status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Algorithmic Trading Module</span>
            </div>
            <h1 className="text-3xl font-extrabold text-neutral-900 mt-1">FentiBot Engine</h1>
          </div>

        </div>

        {authStatus !== 'authenticated' && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
            <p className="text-sm font-semibold text-brand-700">Log in to run automated trading strategies with real capital.</p>
            <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
              Log in
            </Link>
          </div>
        )}

        {actionError && <Notice text={describeApiError(actionError).title} />}
        {botQuery.isPending && <p className="text-sm text-neutral-500">Loading bot state...</p>}

        {/* Configuration Card */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 text-emerald-400 shadow-md">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-neutral-900">Server-side bot</h2>
                <p className="text-xs text-neutral-500">Execution is controlled by the authoritative server bot engine.</p>
              </div>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${status === 'active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 animate-pulse' : 'bg-neutral-100 text-neutral-500'}`}>
              {statusText}
            </span>
          </div>

          {status === 'strategy_unconfigured' && <Notice text="No trading strategy has been configured yet." />}

          <div className="pt-4 border-t border-neutral-100 flex gap-3">
            {status !== 'active' ? (
              <button
                type="button"
                disabled={authStatus !== 'authenticated' || isBusy || status === 'strategy_unconfigured'}
                onClick={() => activateMutation.mutate()}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-bold text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50"
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
      </div>
    </AppShell>
  );
}
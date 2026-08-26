'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Pause, Play, ScrollText, Settings, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  activateBot,
  deactivateBot,
  getBot,
  getBotCatalog,
  listBets,
  listBotLogs,
  listInstruments,
  type BotStatus,
} from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { BetDetailModal } from '@/components/betting/BetDetailModal';
import { BetRow } from '@/components/betting/BetRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { StatusBadge, type StatusStyle } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';

const BOT_STATUS_STYLES: Record<BotStatus, StatusStyle> = {
  active: { label: 'Running', className: 'bg-brand-50 text-brand-600', icon: CheckCircle2 },
  inactive: { label: 'Paused', className: 'bg-neutral-100 text-neutral-700', icon: Pause },
  strategy_unconfigured: { label: 'Not configured', className: 'bg-amber-50 text-amber-700', icon: AlertCircle },
};

const LOG_LEVEL_CLASSES: Record<string, string> = {
  success: 'text-brand-600',
  error: 'text-loss-500',
  skipped: 'text-neutral-400',
  info: 'text-neutral-500',
};

export function BotDetail({ botId }: { botId: string }) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [openBetId, setOpenBetId] = useState<string | null>(null);

  const botQuery = useQuery({ queryKey: ['bot', botId], queryFn: () => getBot(botId) });
  const catalogQuery = useQuery({ queryKey: ['bots', 'catalog'], queryFn: getBotCatalog });
  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: () => listInstruments() });
  const tradesQuery = useQuery({
    queryKey: ['bot', botId, 'trades'],
    queryFn: () => listBets({ botId, limit: 10 }),
    enabled: Boolean(botQuery.data),
  });
  const logsQuery = useQuery({
    queryKey: ['bot', botId, 'logs'],
    queryFn: () => listBotLogs(botId, { limit: 25 }),
    enabled: Boolean(botQuery.data),
  });

  const activateMutation = useMutation({
    mutationFn: () => activateBot(botId),
    onSuccess: (bot) => {
      queryClient.setQueryData(['bot', botId], bot);
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
    },
    onError: (error) => show({ tone: 'error', title: 'Could not activate bot', description: describeApiError(error).title }),
  });
  const deactivateMutation = useMutation({
    mutationFn: () => deactivateBot(botId),
    onSuccess: (bot) => {
      queryClient.setQueryData(['bot', botId], bot);
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
    },
    onError: (error) => show({ tone: 'error', title: 'Could not deactivate bot', description: describeApiError(error).title }),
  });

  if (botQuery.isPending) return <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />;
  if (botQuery.error) return <Notice text={describeApiError(botQuery.error).title} />;

  const bot = botQuery.data!;
  const entry = catalogQuery.data?.items.find((item) => item.key === bot.strategyKey);
  const instrumentById = new Map((instrumentsQuery.data?.items ?? []).map((instrument) => [instrument.id, instrument]));
  const trades = tradesQuery.data?.items ?? [];
  const logs = logsQuery.data?.items ?? [];
  const isBusy = activateMutation.isPending || deactivateMutation.isPending;
  const netPnl = bot.stats ? BigInt(bot.stats.totalPnlMinorUnits) : 0n;
  const configCurrency = typeof bot.config.currency === 'string' ? bot.config.currency : 'USD';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">{entry?.name ?? bot.strategyKey}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">{bot.name}</h1>
        </div>
        <StatusBadge status={bot.status} styles={BOT_STATUS_STYLES} />
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Total P/L"
            value={bot.stats && bot.stats.totalTrades > 0 ? `${netPnl >= 0n ? '+' : '-'}${formatCurrencyMinorUnits((netPnl < 0n ? -netPnl : netPnl).toString(), configCurrency)}` : '—'}
            tone={!bot.stats || bot.stats.totalTrades === 0 ? undefined : netPnl >= 0n ? 'positive' : 'negative'}
          />
          <Stat label="Executions" value={String(bot.stats?.totalExecutions ?? 0)} />
          <Stat label="Trades" value={String(bot.stats?.totalTrades ?? 0)} />
          <Stat label="Active since" value={bot.status === 'active' ? new Date(bot.updatedAt).toLocaleDateString() : '—'} />
        </dl>
      </div>

      <div className="flex flex-wrap gap-3">
        {bot.status === 'active' ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => deactivateMutation.mutate()}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-loss-50 px-4 py-3 text-sm font-bold text-loss-500 transition hover:bg-loss-50/80 disabled:opacity-50"
          >
            <Pause className="h-4 w-4" aria-hidden="true" /> Pause bot
          </button>
        ) : (
          <button
            type="button"
            disabled={isBusy || bot.status === 'strategy_unconfigured'}
            onClick={() => activateMutation.mutate()}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
          >
            <Play className="h-4 w-4" aria-hidden="true" /> Start bot
          </button>
        )}
        <Link
          href={bot.status === 'active' ? '#' : `/bots/${bot.id}/edit`}
          aria-disabled={bot.status === 'active'}
          className={`flex items-center justify-center gap-2 rounded-full border border-neutral-200 px-4 py-3 text-sm font-bold text-neutral-700 transition ${bot.status === 'active' ? 'pointer-events-none opacity-40' : 'hover:bg-neutral-50'}`}
        >
          <Settings className="h-4 w-4" aria-hidden="true" /> Configure
        </Link>
      </div>

      <section aria-labelledby="recent-trades-heading">
        <h2 id="recent-trades-heading" className="text-sm font-bold text-neutral-900">Recent trades</h2>
        <div className="mt-3">
          {tradesQuery.error ? (
            <Notice text={describeApiError(tradesQuery.error).title} />
          ) : trades.length === 0 ? (
            <EmptyState icon={XCircle} title="No trades yet" description="This bot hasn't placed a bet yet — it will appear here as soon as it does." />
          ) : (
            <ul className="space-y-2">
              {trades.map((bet) => (
                <BetRow key={bet.id} bet={bet} instrument={instrumentById.get(bet.instrumentId)} onClick={() => setOpenBetId(bet.id)} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="bot-logs-heading">
        <h2 id="bot-logs-heading" className="flex items-center gap-2 text-sm font-bold text-neutral-900">
          <ScrollText className="h-4 w-4" aria-hidden="true" /> Bot logs
        </h2>
        <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-950 p-3 font-mono text-xs">
          {logsQuery.error ? (
            <Notice text={describeApiError(logsQuery.error).title} />
          ) : logs.length === 0 ? (
            <p className="p-2 text-neutral-400">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {logs.map((log) => (
                <li key={log.id} className="flex gap-2">
                  <span className="shrink-0 text-neutral-500">[{new Date(log.occurredAt).toLocaleTimeString()}]</span>
                  <span className={LOG_LEVEL_CLASSES[log.level] ?? 'text-neutral-300'}>{log.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {openBetId && (
        <BetDetailModal
          betId={openBetId}
          instrument={instrumentById.get(trades.find((bet) => bet.id === openBetId)?.instrumentId ?? '')}
          onClose={() => setOpenBetId(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-bold ${tone === 'positive' ? 'text-brand-600' : tone === 'negative' ? 'text-loss-500' : 'text-neutral-900'}`}>
        {value}
      </dd>
    </div>
  );
}

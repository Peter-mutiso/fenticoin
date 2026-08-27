'use client';

import { useQuery } from '@tanstack/react-query';
import { Bot as BotIcon, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatExecutionInterval, getBotCatalog, listBots, type Bot, type BotPreset, type StrategyCatalogEntry, type StrategyCategory } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';

const RISK_STYLES: Record<string, string> = {
  low: 'bg-brand-50 text-brand-600',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-loss-50 text-loss-500',
};

const CATEGORY_LABELS: Record<StrategyCategory, string> = {
  dca: 'Dollar-Cost Averaging',
  momentum: 'Momentum',
  grid: 'Grid',
};
const CATEGORY_ORDER: StrategyCategory[] = ['dca', 'momentum', 'grid'];

export function BotsBrowser() {
  const { isDemo } = useAuth();
  const [category, setCategory] = useState<StrategyCategory>('dca');

  const botsQuery = useQuery({ queryKey: ['bots'], queryFn: listBots });
  const catalogQuery = useQuery({ queryKey: ['bots', 'catalog'], queryFn: getBotCatalog });

  if (botsQuery.isPending || catalogQuery.isPending) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-3xl bg-neutral-100" />
        <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    );
  }
  if (botsQuery.error) return <Notice text={describeApiError(botsQuery.error).title} />;
  if (catalogQuery.error) return <Notice text={describeApiError(catalogQuery.error).title} />;

  const { items: bots, summary } = botsQuery.data!;
  const catalog = catalogQuery.data!.items;
  const presets = catalogQuery.data!.presets;
  const strategyByKey = new Map(catalog.map((entry) => [entry.key, entry]));

  const categoriesPresent = CATEGORY_ORDER.filter((cat) => catalog.some((entry) => entry.category === cat));
  const entriesInCategory = catalog.filter((entry) => entry.category === category);
  const availableEntry = entriesInCategory.find((entry) => !entry.comingSoon);
  const botsInCategory = bots.filter((bot) => strategyByKey.get(bot.strategyKey ?? '')?.category === category);

  return (
    <div className="space-y-6">
      <div>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-400">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Automated trading
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">Trading bots</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isDemo
            ? 'Create and manage automated strategies that trade with your demo balance, using the same real trading engine as a live account.'
            : 'Create and manage automated strategies that trade with your real balance.'}
        </p>
      </div>

      <div className="rounded-3xl bg-neutral-950 p-5 text-white">
        <dl className="grid grid-cols-3 gap-4">
          <div>
            <dt className="text-xs text-white/50">Total bots</dt>
            <dd className="mt-1 text-2xl font-bold">{summary.totalBots}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/50">Active</dt>
            <dd className="mt-1 text-2xl font-bold">{summary.activeBots}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/50">Weekly return</dt>
            <dd className={`mt-1 text-2xl font-bold ${summary.weeklyReturnPercent === null ? 'text-white/40' : summary.weeklyReturnPercent >= 0 ? 'text-brand-400' : 'text-loss-400'}`}>
              {summary.weeklyReturnPercent === null ? '—' : `${summary.weeklyReturnPercent >= 0 ? '+' : ''}${summary.weeklyReturnPercent.toFixed(1)}%`}
            </dd>
          </div>
        </dl>
      </div>

      {presets.length > 0 && (
        <section aria-labelledby="recommended-bots-heading">
          <h2 id="recommended-bots-heading" className="text-sm font-bold text-neutral-900">Recommended bots</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Pre-configured starting points for our real strategies below — every card runs the same deterministic, server-side engine as a bot built from scratch.
          </p>
          <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
            {presets.map((preset) => (
              <PresetCard key={preset.key} preset={preset} strategyName={strategyByKey.get(preset.strategyKey)?.name} />
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {categoriesPresent.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
              category === cat ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <section aria-labelledby="strategy-heading">
        <h2 id="strategy-heading" className="text-sm font-bold text-neutral-900">{CATEGORY_LABELS[category]}</h2>

        {!availableEntry ? (
          <div className="mt-3">
            <EmptyState icon={BotIcon} title="Coming soon" description={entriesInCategory[0]?.description ?? "This strategy isn't available yet."} />
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {botsInCategory.map((bot) => (
              <BotCard key={bot.id} bot={bot} entry={strategyByKey.get(bot.strategyKey ?? '')} />
            ))}

            {botsInCategory.length === 0 && (
              <p className="text-sm text-neutral-500">{availableEntry.description}</p>
            )}

            <Link
              href={`/bots/new?strategy=${availableEntry.key}`}
              className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 py-4 text-sm font-bold text-neutral-600 transition hover:border-brand-500 hover:text-brand-600"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> New {availableEntry.name.toLowerCase()} bot
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

/** A "Recommended Bots" marketplace card — a named preset of a real strategy, never a fabricated one. See `bot-presets.ts`. */
function PresetCard({ preset, strategyName }: { preset: BotPreset; strategyName?: string }) {
  return (
    <div className="w-64 shrink-0 snap-start rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-neutral-900">{preset.name}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${RISK_STYLES[preset.riskLevel]}`}>{preset.riskLevel} risk</span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Strategy: {strategyName ?? preset.strategyKey} · Every {formatExecutionInterval(preset.executionIntervalSeconds)}
      </p>
      {preset.recommendedInstrumentSymbol && <p className="mt-1 text-xs text-neutral-400">Suggested market: {preset.recommendedInstrumentSymbol}</p>}
      <p className="mt-2 text-xs leading-5 text-neutral-600">{preset.description}</p>
      {/* No performance metric here: a preset is a configuration, not a bot anyone has run yet — showing a number would be fabricated. */}
      <Link
        href={`/bots/new?strategy=${preset.strategyKey}&preset=${preset.key}`}
        className="mt-3 flex items-center justify-center rounded-full bg-brand-500 py-2 text-center text-sm font-bold text-white transition hover:bg-brand-600"
      >
        Use bot
      </Link>
    </div>
  );
}

function BotCard({ bot, entry }: { bot: Bot; entry?: StrategyCatalogEntry }) {
  const currency = typeof bot.config.currency === 'string' ? bot.config.currency : 'USD';
  const netPnl = bot.stats ? BigInt(bot.stats.totalPnlMinorUnits) : 0n;
  const hasTrades = Boolean(bot.stats && bot.stats.totalTrades > 0);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-neutral-900">{bot.name}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Every {formatExecutionInterval(bot.executionIntervalSeconds)} · {entry?.riskLevel} risk
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${bot.status === 'active' ? 'bg-brand-50 text-brand-600' : 'bg-neutral-100 text-neutral-500'}`}>
          {bot.status === 'active' ? 'Running' : bot.status === 'inactive' ? 'Paused' : 'Not configured'}
        </span>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Performance: {hasTrades ? `${netPnl >= 0n ? '+' : '-'}${formatCurrencyMinorUnits((netPnl < 0n ? -netPnl : netPnl).toString(), currency)}` : '—'}
      </p>
      <div className="mt-3 flex gap-2">
        <Link
          href={bot.status === 'active' ? '#' : `/bots/${bot.id}/edit`}
          aria-disabled={bot.status === 'active'}
          className={`flex-1 rounded-full border border-neutral-200 py-2 text-center text-sm font-bold text-neutral-700 transition ${bot.status === 'active' ? 'pointer-events-none opacity-40' : 'hover:bg-neutral-50'}`}
        >
          Configure
        </Link>
        <Link href={`/bots/${bot.id}`} className="flex-1 rounded-full bg-brand-500 py-2 text-center text-sm font-bold text-white transition hover:bg-brand-600">
          View bot
        </Link>
      </div>
    </div>
  );
}

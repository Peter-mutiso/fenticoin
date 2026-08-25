'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, LoaderCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { type BetType, getBettingConfig, getPrice, getWallet, listInstruments, placeBet } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { estimatePotentialPayoutMinorUnits, formatCurrencyMinorUnits, parseStakeToMinorUnits } from '@/lib/money';
import { useInstrumentRealtimeSubscription } from '@/lib/realtime/RealtimeProvider';
import { useDialogA11y } from '@/lib/useDialogA11y';
import { PriceQuoteBadge } from '@/components/markets/PriceQuoteBadge';
import { Notice } from '@/components/ui/Notice';
import { useToast } from '@/components/ui/Toast';
import { BetsPanel } from './BetsPanel';

const PRODUCTS: { type: BetType; title: string; detail: string; choices: [string, string] }[] = [
  { type: 'rise_fall', title: 'Rise / Fall', detail: 'Price versus your entry price', choices: ['rise', 'fall'] },
  { type: 'higher_lower', title: 'Higher / Lower', detail: 'Price versus your chosen strike', choices: ['higher', 'lower'] },
  { type: 'up_down', title: 'Up / Down', detail: 'Price versus your entry price', choices: ['up', 'down'] },
];

const DURATION_PRESETS: { seconds: number; label: string }[] = [
  { seconds: 30, label: '30s' },
  { seconds: 60, label: '1m' },
  { seconds: 300, label: '5m' },
  { seconds: 900, label: '15m' },
  { seconds: 3_600, label: '1h' },
  { seconds: 14_400, label: '4h' },
  { seconds: 86_400, label: '1d' },
];

export function BettingExperience() {
  const { status: authStatus } = useAuth();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [type, setType] = useState<BetType>(() => {
    const requested = searchParams.get('type');
    return requested === 'higher_lower' || requested === 'up_down' || requested === 'rise_fall' ? requested : 'rise_fall';
  });
  const [instrumentId, setInstrumentId] = useState(() => searchParams.get('instrument') ?? '');
  const [selection, setSelection] = useState('rise');
  const [stake, setStake] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ title: string; canRetry: boolean } | null>(null);
  const reviewedPayoutRateBasisPoints = useRef<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: () => listInstruments() });
  const instruments = instrumentsQuery.data?.items ?? [];
  const instrument = instruments.find((item) => item.id === instrumentId);

  useInstrumentRealtimeSubscription(instrumentId || undefined);

  const priceQuery = useQuery({
    queryKey: ['price', instrumentId],
    queryFn: () => getPrice(instrumentId),
    enabled: Boolean(instrumentId),
    refetchInterval: 5_000,
  });

  const configQuery = useQuery({
    queryKey: ['betting-config', instrumentId, type],
    queryFn: () => getBettingConfig(instrumentId, type),
    enabled: Boolean(instrumentId) && authStatus === 'authenticated',
    refetchInterval: 15_000,
    retry: false,
  });

  const walletQuery = useQuery({
    queryKey: ['wallet', instrument?.quoteCurrency],
    queryFn: () => getWallet(instrument?.quoteCurrency),
    enabled: Boolean(instrument?.quoteCurrency) && authStatus === 'authenticated',
    refetchInterval: 10_000,
  });

  const product = PRODUCTS.find((item) => item.type === type)!;

  const minStakeSeconds = configQuery.data ? Number(configQuery.data.minDurationSeconds) : undefined;
  const maxStakeSeconds = configQuery.data ? Number(configQuery.data.maxDurationSeconds) : undefined;
  const validDurationPresets = useMemo(
    () => DURATION_PRESETS.filter((preset) => (minStakeSeconds === undefined || preset.seconds >= minStakeSeconds) && (maxStakeSeconds === undefined || preset.seconds <= maxStakeSeconds)),
    [minStakeSeconds, maxStakeSeconds],
  );

  // Reset ticket-specific state whenever the bet type or instrument changes — a duration/direction chosen for one market/type shouldn't silently carry over to another.
  useEffect(() => {
    setSelection(PRODUCTS.find((item) => item.type === type)!.choices[0]);
    setReviewing(false);
    setSubmitError(null);
    setDurationSeconds(null);
  }, [type]);

  useEffect(() => {
    setReviewing(false);
    setSubmitError(null);
    setDurationSeconds(null);
  }, [instrumentId]);

  useEffect(() => {
    if (durationSeconds === null && validDurationPresets.length > 0) {
      setDurationSeconds(validDurationPresets[0]!.seconds);
    }
  }, [durationSeconds, validDurationPresets]);

  let minorStake: bigint | null = null;
  try {
    minorStake = stake.trim() ? parseStakeToMinorUnits(stake, instrument?.quoteCurrency ?? 'USD') : null;
  } catch {
    minorStake = null;
  }

  const minStake = configQuery.data ? BigInt(configQuery.data.minStakeMinorUnits) : undefined;
  const maxStake = configQuery.data ? BigInt(configQuery.data.maxStakeMinorUnits) : undefined;
  const balance = walletQuery.data ? BigInt(walletQuery.data.availableMinorUnits) : undefined;

  const stakeInBounds = Boolean(minorStake !== null && minorStake > 0n && minStake !== undefined && maxStake !== undefined && minorStake >= minStake && minorStake <= maxStake);
  const hasBalance = Boolean(minorStake !== null && balance !== undefined && minorStake <= balance);
  const targetPriceValid = type !== 'higher_lower' || /^\d+(\.\d+)?$/.test(targetPrice.trim());

  const estimatedPayoutMinorUnits =
    minorStake !== null && configQuery.data && instrument
      ? estimatePotentialPayoutMinorUnits(minorStake, BigInt(configQuery.data.payoutRateBasisPoints), instrument.quoteCurrency)
      : null;

  const canReview = Boolean(
    authStatus === 'authenticated' &&
      instrument &&
      instrument.status === 'active' &&
      priceQuery.data &&
      !priceQuery.data.isStale &&
      configQuery.data?.isEnabled &&
      durationSeconds !== null &&
      stakeInBounds &&
      hasBalance &&
      targetPriceValid,
  );

  async function confirmBet() {
    if (!instrument || minorStake === null || durationSeconds === null || !canReview || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const bet = await placeBet(
        {
          instrumentId: instrument.id,
          type,
          selection,
          stakeAmount: minorStake.toString(),
          currency: instrument.quoteCurrency,
          durationSeconds,
          ...(type === 'higher_lower' ? { targetPrice: targetPrice.trim() } : {}),
        },
        idempotencyKey.current,
      );

      setReviewing(false);
      idempotencyKey.current = null;
      setStake('');
      setTargetPrice('');

      show({
        tone: 'success',
        title: 'Bet confirmed',
        description: `${instrument.displaySymbol} · ${product.title} · ${selection} · ${formatCurrencyMinorUnits(bet.stakeAmountMinorUnits, bet.currency)} staked`,
      });

      // The config the review step displayed could have been edited by an
      // admin between review and confirm — the bet's own snapshotted rate
      // (what actually determines the payout) always wins, but the user
      // should know if it moved from what they reviewed.
      if (reviewedPayoutRateBasisPoints.current !== null && reviewedPayoutRateBasisPoints.current !== bet.payoutRateBasisPoints) {
        show({
          tone: 'info',
          title: 'Odds changed before your bet was confirmed',
          description: `Final payout rate: ${(Number(bet.payoutRateBasisPoints) / 100).toFixed(2)}% profit (this bet's payout is locked in and unaffected by any further changes).`,
          durationMs: 9_000,
        });
      }

      await Promise.all([
        walletQuery.refetch(),
        configQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['bets', 'recent'] }),
      ]);
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }

  function openReview() {
    reviewedPayoutRateBasisPoints.current = configQuery.data?.payoutRateBasisPoints ?? null;
    setReviewing(true);
    setSubmitError(null);
  }

  return (
    <section className="pb-8" aria-labelledby="betting-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-600">FentiCoin Markets</p>
          <h1 id="betting-heading" className="mt-1 text-3xl font-bold tracking-tight">
            Make a prediction
          </h1>
        </div>
        {authStatus === 'authenticated' && (
          <div className="rounded-full bg-navy-950 px-4 py-2 text-sm font-semibold text-white">
            Available: {walletQuery.data ? formatCurrencyMinorUnits(walletQuery.data.availableMinorUnits, walletQuery.data.currency) : '…'}
          </div>
        )}
      </div>

      {authStatus === 'unauthenticated' && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
          <p className="text-sm font-semibold text-brand-700">Log in to see live odds, your balance, and place a bet.</p>
          <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
            Log in
          </Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm font-semibold text-neutral-900">1. Choose a market</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {PRODUCTS.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setType(item.type)}
                  className={`rounded-xl border px-2 py-3 text-left transition ${
                    type === item.type ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <span className="block text-xs font-bold sm:text-sm">{item.title}</span>
                  <span className="mt-1 hidden text-[11px] text-neutral-500 sm:block">{item.detail}</span>
                </button>
              ))}
            </div>

            <label className="mt-5 block text-sm font-semibold">
              Instrument
              <select
                value={instrumentId}
                onChange={(event) => setInstrumentId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm outline-none ring-brand-500 focus:ring-2"
              >
                <option value="">Select an instrument</option>
                {instruments.map((item) => (
                  <option key={item.id} value={item.id} disabled={item.status !== 'active'}>
                    {item.displaySymbol} · {item.name}
                    {item.status !== 'active' ? ' (closed)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {instrumentsQuery.isLoading && <p className="mt-3 text-sm text-neutral-500">Loading available instruments…</p>}
            {instrumentsQuery.error && <Notice text={describeApiError(instrumentsQuery.error).title} className="mt-3" />}
            {instrument && <PriceQuoteBadge price={priceQuery.data} currency={instrument.quoteCurrency} loading={priceQuery.isLoading} className="mt-4" />}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm font-semibold text-neutral-900">2. Pick your direction</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {product.choices.map((choice, index) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setSelection(choice)}
                  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold capitalize transition ${
                    selection === choice ? (index === 0 ? 'bg-brand-500 text-white' : 'bg-loss-500 text-white') : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {index === 0 ? <ArrowUp className="h-4 w-4" aria-hidden="true" /> : <ArrowDown className="h-4 w-4" aria-hidden="true" />}
                  {choice}
                </button>
              ))}
            </div>

            {type === 'higher_lower' && (
              <label className="mt-4 block text-sm font-semibold">
                Strike price
                <input
                  inputMode="decimal"
                  value={targetPrice}
                  onChange={(event) => setTargetPrice(event.target.value)}
                  placeholder={priceQuery.data ? `e.g. ${priceQuery.data.price}` : 'e.g. 65000.00'}
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-3 outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
            )}

            <label className="mt-4 block text-sm font-semibold">
              Stake <span className="font-normal text-neutral-500">({instrument?.quoteCurrency ?? 'USD'})</span>
              <input
                inputMode="decimal"
                value={stake}
                onChange={(event) => setStake(event.target.value)}
                placeholder="0.00"
                className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            {configQuery.data && (
              <p className="mt-2 text-xs text-neutral-500">
                Stake range: {formatCurrencyMinorUnits(configQuery.data.minStakeMinorUnits, instrument?.quoteCurrency ?? 'USD')}–
                {formatCurrencyMinorUnits(configQuery.data.maxStakeMinorUnits, instrument?.quoteCurrency ?? 'USD')}
              </p>
            )}
            {stake && minorStake !== null && !hasBalance && <Notice text="Insufficient available balance for this stake." className="mt-3" />}
            {stake && !stakeInBounds && minStake !== undefined && <Notice text="Choose a stake within this market's allowed range." className="mt-3" />}
            {configQuery.error && authStatus === 'authenticated' && <Notice text={`${product.title} is not available for this market. ${describeApiError(configQuery.error).title}`} className="mt-3" />}

            {configQuery.data && (
              <div className="mt-4">
                <p className="text-sm font-semibold">Duration</p>
                {validDurationPresets.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {validDurationPresets.map((preset) => (
                      <button
                        key={preset.seconds}
                        type="button"
                        onClick={() => setDurationSeconds(preset.seconds)}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                          durationSeconds === preset.seconds ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    type="number"
                    min={minStakeSeconds}
                    max={maxStakeSeconds}
                    value={durationSeconds ?? ''}
                    onChange={(event) => setDurationSeconds(Number(event.target.value))}
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-3 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="h-fit rounded-2xl bg-navy-950 p-5 text-white shadow-sm sm:p-6">
          <p className="text-sm font-semibold text-white/65">Bet summary</p>
          <h2 className="mt-1 text-xl font-bold">{product.title}</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <Row label="Direction" value={selection} />
            <Row label="Stake" value={minorStake !== null && instrument ? formatCurrencyMinorUnits(minorStake.toString(), instrument.quoteCurrency) : '—'} />
            <Row label="Duration" value={durationSeconds !== null ? DURATION_PRESETS.find((preset) => preset.seconds === durationSeconds)?.label ?? `${durationSeconds}s` : '—'} />
            <Row label="Payout rate (est.)" value={configQuery.data ? `${(Number(configQuery.data.payoutRateBasisPoints) / 100).toFixed(2)}% profit` : '—'} />
            <Row
              label="Potential return (est.)"
              value={estimatedPayoutMinorUnits !== null && instrument ? `~${formatCurrencyMinorUnits(estimatedPayoutMinorUnits.toString(), instrument.quoteCurrency)}` : '—'}
            />
          </dl>
          <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-white/55">
            Estimate only, for your reference. The server sets the live odds, entry price, and final return when you confirm — it is always authoritative.
          </p>
          {priceQuery.data?.isStale && <Notice text="Price is stale. Wait for a fresh quote before placing a bet." className="mt-3" />}
          {instrument && instrument.status !== 'active' && <Notice text="This market is currently closed." className="mt-3" />}
          {configQuery.data && !configQuery.data.isEnabled && <Notice text={`${product.title} is not currently available for this market.`} className="mt-3" />}
          <button
            type="button"
            disabled={!canReview}
            onClick={openReview}
            className="mt-5 flex w-full items-center justify-center rounded-full bg-brand-500 px-4 py-3 font-bold transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-white/20"
          >
            Review bet
          </button>
        </aside>
      </div>

      {reviewing && instrument && (
        <ReviewModal
          product={product.title}
          selection={selection}
          stake={minorStake !== null ? formatCurrencyMinorUnits(minorStake.toString(), instrument.quoteCurrency) : '—'}
          estimate={estimatedPayoutMinorUnits !== null ? formatCurrencyMinorUnits(estimatedPayoutMinorUnits.toString(), instrument.quoteCurrency) : '—'}
          submitting={submitting}
          error={submitError}
          onCancel={() => !submitting && setReviewing(false)}
          onConfirm={confirmBet}
        />
      )}

      <BetsPanel instruments={instruments} />
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-white/60">{label}</dt>
      <dd className="font-semibold capitalize">{value}</dd>
    </div>
  );
}

function ReviewModal({
  product,
  selection,
  stake,
  estimate,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  product: string;
  selection: string;
  stake: string;
  estimate: string;
  submitting: boolean;
  error: { title: string; canRetry: boolean } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const closeIfIdle = () => {
    if (!submitting) onCancel();
  };
  const containerRef = useDialogA11y<HTMLDivElement>(closeIfIdle);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-navy-950/50 p-0 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Review bet">
      <div ref={containerRef} tabIndex={-1} className="w-full rounded-t-3xl bg-white p-6 shadow-xl outline-none sm:max-w-md sm:rounded-3xl">
        <ShieldCheck className="h-8 w-8 text-brand-500" aria-hidden="true" />
        <h2 className="mt-3 text-2xl font-bold">Review your bet</h2>
        <p className="mt-2 text-sm text-neutral-600">
          {product} · <span className="font-semibold capitalize">{selection}</span>
        </p>
        <div className="mt-5 rounded-xl bg-neutral-50 p-4 text-sm">
          <div className="flex justify-between">
            <span>Stake</span>
            <strong>{stake}</strong>
          </div>
          <div className="mt-3 flex justify-between">
            <span>Estimated return</span>
            <strong>~{estimate}</strong>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-neutral-500">
          Final odds and return are set by the server when you confirm. A changed market rule may alter or reject this bet.
        </p>
        {error && <Notice text={error.title} className="mt-3" />}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" disabled={submitting} onClick={onCancel} className="rounded-full bg-neutral-100 px-4 py-3 font-semibold disabled:opacity-50">
            Back
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="flex items-center justify-center rounded-full bg-brand-500 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {submitting ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Confirming
              </>
            ) : (
              'Confirm bet'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

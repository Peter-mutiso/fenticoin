
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ArrowDown,
  ArrowUp,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  type BetType,
  getBettingConfig,
  getPrice,
  getWallet,
  listInstruments,
  placeBet,
} from '@/lib/api-client';

import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';

import {
  estimatePotentialPayoutMinorUnits,
  formatCurrencyMinorUnits,
  parseStakeToMinorUnits,
} from '@/lib/money';

import { useInstrumentRealtimeSubscription } from '@/lib/realtime/RealtimeProvider';
import { useDialogA11y } from '@/lib/useDialogA11y';
import { PriceQuoteBadge } from '@/components/markets/PriceQuoteBadge';
import { Notice } from '@/components/ui/Notice';
import { useToast } from '@/components/ui/Toast';
import { BetsPanel } from './BetsPanel';

const PRODUCTS: {
  type: BetType;
  title: string;
  detail: string;
  choices: [string, string];
}[] = [
  {
    type: 'rise_fall',
    title: 'Rise / Fall',
    detail: 'Price versus your entry price',
    choices: ['rise', 'fall'],
  },
  {
    type: 'higher_lower',
    title: 'Higher / Lower',
    detail: 'Price versus your chosen strike',
    choices: ['higher', 'lower'],
  },
  {
    type: 'up_down',
    title: 'Up / Down',
    detail: 'Price versus your entry price',
    choices: ['up', 'down'],
  },
];

function getProduct(type: BetType) {
  return PRODUCTS.find((item) => item.type === type) ?? PRODUCTS[0]!;
}

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

    return requested === 'higher_lower' ||
      requested === 'up_down' ||
      requested === 'rise_fall'
      ? requested
      : 'rise_fall';
  });

  const [instrumentId, setInstrumentId] = useState(
    () => searchParams.get('instrument') ?? '',
  );

  const [selection, setSelection] = useState('rise');
  const [stake, setStake] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<{
    title: string;
    canRetry: boolean;
  } | null>(null);

  const reviewedPayoutRateBasisPoints = useRef<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  /*
   * --------------------------------------------------------------------------
   * DATA
   * --------------------------------------------------------------------------
   */

  const instrumentsQuery = useQuery({
    queryKey: ['instruments'],
    queryFn: () => listInstruments(),
  });

  const instruments = instrumentsQuery.data?.items ?? [];

  useEffect(() => {
    if (!instrumentId && instruments.length > 0) {
      const defaultInstrument =
        instruments.find((item) => item.status === 'active') ?? instruments[0];

      if (defaultInstrument) {
        setInstrumentId(defaultInstrument.id);
      }
    }
  }, [instruments, instrumentId]);

  const instrument = instruments.find(
    (item) => item.id === instrumentId,
  );

  useInstrumentRealtimeSubscription(instrumentId || undefined);

  /*
   * Price is DISPLAY-ONLY on this screen.
   *
   * It is deliberately NOT required for Review or Confirm.
   *
   * The backend remains responsible for obtaining and validating the
   * authoritative entry price when placeBet() is called.
   */
  const priceQuery = useQuery({
    queryKey: ['price', instrumentId],
    queryFn: () => getPrice(instrumentId),
    enabled: Boolean(instrumentId),
    refetchInterval: 5_000,
    retry: 2,
  });

  const configQuery = useQuery({
    queryKey: ['betting-config', instrumentId, type],
    queryFn: () => getBettingConfig(instrumentId, type),
    enabled:
      Boolean(instrumentId) &&
      authStatus === 'authenticated',
    refetchInterval: 15_000,
    retry: false,
  });

  const walletQuery = useQuery({
    queryKey: ['wallet', instrument?.quoteCurrency],
    queryFn: () => getWallet(instrument?.quoteCurrency),
    enabled:
      Boolean(instrument?.quoteCurrency) &&
      authStatus === 'authenticated',
    refetchInterval: 10_000,
  });

  /*
   * --------------------------------------------------------------------------
   * PRODUCT / CONFIG
   * --------------------------------------------------------------------------
   */

  const product = getProduct(type);

  const minDurationSeconds = configQuery.data
    ? Number(configQuery.data.minDurationSeconds)
    : undefined;

  const maxDurationSeconds = configQuery.data
    ? Number(configQuery.data.maxDurationSeconds)
    : undefined;

  const validDurationPresets = useMemo(
    () =>
      DURATION_PRESETS.filter(
        (preset) =>
          (minDurationSeconds === undefined ||
            preset.seconds >= minDurationSeconds) &&
          (maxDurationSeconds === undefined ||
            preset.seconds <= maxDurationSeconds),
      ),
    [minDurationSeconds, maxDurationSeconds],
  );

  /*
   * --------------------------------------------------------------------------
   * RESET STATE WHEN PRODUCT CHANGES
   * --------------------------------------------------------------------------
   */

  useEffect(() => {
    setSelection(
      PRODUCTS.find((item) => item.type === type)?.choices[0] ?? 'rise',
    );

    setTargetPrice('');
    setReviewing(false);
    setSubmitError(null);
    setDurationSeconds(null);
    idempotencyKey.current = null;
    reviewedPayoutRateBasisPoints.current = null;
  }, [type]);

  /*
   * --------------------------------------------------------------------------
   * RESET STATE WHEN INSTRUMENT CHANGES
   * --------------------------------------------------------------------------
   */

  useEffect(() => {
    setReviewing(false);
    setSubmitError(null);
    setDurationSeconds(null);
    setTargetPrice('');
    idempotencyKey.current = null;
    reviewedPayoutRateBasisPoints.current = null;
  }, [instrumentId]);

  /*
   * --------------------------------------------------------------------------
   * DEFAULT DURATION
   * --------------------------------------------------------------------------
   */

  useEffect(() => {
    if (
      durationSeconds === null &&
      validDurationPresets.length > 0
    ) {
      setDurationSeconds(validDurationPresets[0]!.seconds);
    }
  }, [durationSeconds, validDurationPresets]);

  /*
   * --------------------------------------------------------------------------
   * MONEY
   * --------------------------------------------------------------------------
   */

  let minorStake: bigint | null = null;

  try {
    minorStake = stake.trim()
      ? parseStakeToMinorUnits(
          stake,
          instrument?.quoteCurrency ?? 'USD',
        )
      : null;
  } catch {
    minorStake = null;
  }

  let minStake: bigint | undefined;
  let maxStake: bigint | undefined;

  try {
    minStake = configQuery.data
      ? BigInt(configQuery.data.minStakeMinorUnits)
      : undefined;

    maxStake = configQuery.data
      ? BigInt(configQuery.data.maxStakeMinorUnits)
      : undefined;
  } catch {
    minStake = undefined;
    maxStake = undefined;
  }

  let balance: bigint | undefined;

  try {
    balance = walletQuery.data
      ? BigInt(walletQuery.data.availableMinorUnits)
      : undefined;
  } catch {
    balance = undefined;
  }

  /*
   * --------------------------------------------------------------------------
   * VALIDATION
   * --------------------------------------------------------------------------
   */

  const stakeInBounds = Boolean(
    minorStake !== null &&
      minorStake > 0n &&
      minStake !== undefined &&
      maxStake !== undefined &&
      minorStake >= minStake &&
      minorStake <= maxStake,
  );

  const hasBalance = Boolean(
    minorStake !== null &&
      balance !== undefined &&
      minorStake <= balance,
  );

  const targetPriceValid =
    type !== 'higher_lower' ||
    /^\d+(?:\.\d+)?$/.test(targetPrice.trim());

  const estimatedPayoutMinorUnits =
    minorStake !== null &&
    configQuery.data &&
    instrument
      ? estimatePotentialPayoutMinorUnits(
          minorStake,
          BigInt(configQuery.data.payoutRateBasisPoints),
          instrument.quoteCurrency,
        )
      : null;

  /*
   * --------------------------------------------------------------------------
   * PRICE STATUS
   * --------------------------------------------------------------------------
   *
   * These values are informational only.
   * They are NOT part of the Review/Confirm gate.
   */

  const priceAvailable = Boolean(priceQuery.data);

  const priceFresh = Boolean(
    priceQuery.data &&
      !priceQuery.data.isStale,
  );

  /*
   * --------------------------------------------------------------------------
   * REVIEW CHECKS
   * --------------------------------------------------------------------------
   *
   * IMPORTANT:
   * There is intentionally NO priceAvailable / priceFresh check here.
   *
   * The browser's market quote is only a display/estimate.
   * The server obtains the authoritative price when placeBet() executes.
   */

  const reviewChecks = {
    authenticated:
      authStatus === 'authenticated',

    instrumentSelected:
      Boolean(instrument),

    instrumentActive:
      instrument?.status === 'active',

    bettingConfigLoaded:
      Boolean(configQuery.data),

    bettingEnabled:
      Boolean(configQuery.data?.isEnabled),

    durationSelected:
      durationSeconds !== null,

    stakeInBounds,

    hasBalance,

    targetPriceValid,
  };

  const canReview =
    Object.values(reviewChecks).every(Boolean);

  /*
   * --------------------------------------------------------------------------
   * CONFIRM BET
   * --------------------------------------------------------------------------
   *
   * IMPORTANT:
   * Do NOT refetch the frontend price here.
   *
   * placeBet() sends the bet parameters only.
   * The backend remains responsible for:
   *   - obtaining the authoritative market price
   *   - validating freshness
   *   - deriving entryPrice
   *   - calculating exposure/payout
   *   - reserving funds
   *   - creating the bet
   */

  async function confirmBet() {
    if (
      !instrument ||
      minorStake === null ||
      durationSeconds === null ||
      !stakeInBounds ||
      !hasBalance ||
      instrument.status !== 'active' ||
      !configQuery.data?.isEnabled ||
      submitting
    ) {
      return;
    }

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

          ...(type === 'higher_lower'
            ? {
                targetPrice: targetPrice.trim(),
              }
            : {}),
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
        description:
          `${instrument.displaySymbol} · ` +
          `${product.title} · ` +
          `${selection} · ` +
          `${formatCurrencyMinorUnits(
            bet.stakeAmountMinorUnits,
            bet.currency,
          )} staked`,
      });

      if (
        reviewedPayoutRateBasisPoints.current !== null &&
        reviewedPayoutRateBasisPoints.current !==
          bet.payoutRateBasisPoints
      ) {
        show({
          tone: 'info',
          title: 'Odds changed before your bet was confirmed',
          description:
            `Final payout rate: ${(
              Number(bet.payoutRateBasisPoints) / 100
            ).toFixed(2)}% profit. ` +
            `This bet's payout is locked in and will not change.`,
          durationMs: 9000,
        });
      }

      reviewedPayoutRateBasisPoints.current = null;

      await Promise.all([
        walletQuery.refetch(),
        configQuery.refetch(),
        queryClient.invalidateQueries({
          queryKey: ['bets', 'recent'],
        }),
      ]);
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }

  function openReview() {
    reviewedPayoutRateBasisPoints.current =
      configQuery.data?.payoutRateBasisPoints ?? null;

    setReviewing(true);
    setSubmitError(null);
  }

  /*
   * --------------------------------------------------------------------------
   * RENDER
   * --------------------------------------------------------------------------
   */

  return (
    <section
      className="pb-8"
      aria-labelledby="betting-heading"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-700">
            FentiCoin Markets
          </p>

          <h1
            id="betting-heading"
            className="mt-1 text-3xl font-bold tracking-tight"
          >
            Make a prediction
          </h1>
        </div>

        {authStatus === 'authenticated' && (
          <div className="rounded-full bg-navy-950 px-4 py-2 text-sm font-semibold text-white">
            Available:{' '}
            {walletQuery.data
              ? formatCurrencyMinorUnits(
                  walletQuery.data.availableMinorUnits,
                  walletQuery.data.currency,
                )
              : '…'}
          </div>
        )}
      </div>

      {authStatus === 'unauthenticated' && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
          <p className="text-sm font-semibold text-brand-700">
            Log in to see live odds, your balance,
            and place a bet.
          </p>

          <Link
            href="/login"
            className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-navy-950 transition hover:bg-brand-600"
          >
            Log in
          </Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-5">
          {/* MARKET */}

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm font-semibold text-neutral-900">
              1. Choose a market
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {PRODUCTS.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setType(item.type)}
                  className={`rounded-xl border px-2 py-3 text-left transition ${
                    type === item.type
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <span className="block text-xs font-bold sm:text-sm">
                    {item.title}
                  </span>

                  <span className="mt-1 hidden text-[11px] text-neutral-500 sm:block">
                    {item.detail}
                  </span>
                </button>
              ))}
            </div>

            <label className="mt-5 block text-sm font-semibold">
              Instrument

              <select
                value={instrumentId}
                onChange={(event) =>
                  setInstrumentId(event.target.value)
                }
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm outline-none ring-brand-500 focus:ring-2"
              >
                <option value="">
                  Select an instrument
                </option>

                {instruments.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    disabled={item.status !== 'active'}
                  >
                    {item.displaySymbol} · {item.name}
                    {item.status !== 'active'
                      ? ' (closed)'
                      : ''}
                  </option>
                ))}
              </select>
            </label>

            {instrumentsQuery.isLoading && (
              <p className="mt-3 text-sm text-neutral-500">
                Loading available instruments…
              </p>
            )}

            {instrumentsQuery.error && (
              <Notice
                text={
                  describeApiError(
                    instrumentsQuery.error,
                  ).title
                }
                className="mt-3"
              />
            )}

            {instrument && (
              <PriceQuoteBadge
                price={priceQuery.data}
                currency={instrument.quoteCurrency}
                loading={priceQuery.isLoading}
                className="mt-4"
              />
            )}

            {instrument && (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2">
                <span className="text-xs font-medium text-neutral-500">
                  Market price
                </span>

                <span className="text-xs font-semibold text-neutral-700">
                  {priceAvailable
                    ? priceFresh
                      ? 'Live quote'
                      : 'Quote updating'
                    : 'Awaiting quote'}
                </span>
              </div>
            )}
          </div>

          {/* DIRECTION / STAKE / DURATION */}

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm font-semibold text-neutral-900">
              2. Pick your direction
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3">
              {product.choices.map((choice, index) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setSelection(choice)}
                  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold capitalize transition ${
                    selection === choice
                      ? index === 0
                        ? 'bg-brand-500 text-navy-950'
                        : 'bg-loss-500 text-white'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {index === 0 ? (
                    <ArrowUp
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowDown
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                  )}

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
                  onChange={(event) =>
                    setTargetPrice(event.target.value)
                  }
                  placeholder={
                    priceQuery.data
                      ? `e.g. ${priceQuery.data.price}`
                      : 'e.g. 65000.00'
                  }
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-3 outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
            )}

            <label className="mt-4 block text-sm font-semibold">
              Stake{' '}
              <span className="font-normal text-neutral-500">
                ({instrument?.quoteCurrency ?? 'USD'})
              </span>

              <input
                inputMode="decimal"
                value={stake}
                onChange={(event) =>
                  setStake(event.target.value)
                }
                placeholder="0.00"
                className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            {configQuery.data && instrument && (
              <p className="mt-2 text-xs text-neutral-500">
                Stake range:{' '}
                {formatCurrencyMinorUnits(
                  configQuery.data.minStakeMinorUnits,
                  instrument.quoteCurrency,
                )}
                –
                {formatCurrencyMinorUnits(
                  configQuery.data.maxStakeMinorUnits,
                  instrument.quoteCurrency,
                )}
              </p>
            )}

            {stake &&
              minorStake !== null &&
              !hasBalance && (
                <Notice
                  text="Insufficient available balance for this stake."
                  className="mt-3"
                />
              )}

            {stake &&
              !stakeInBounds &&
              minStake !== undefined && (
                <Notice
                  text="Choose a stake within this market's allowed range."
                  className="mt-3"
                />
              )}

            {type === 'higher_lower' &&
              targetPrice.trim() &&
              !targetPriceValid && (
                <Notice
                  text="Enter a valid strike price."
                  className="mt-3"
                />
              )}

            {configQuery.error &&
              authStatus === 'authenticated' && (
                <Notice
                  text={
                    `${product.title} is not available for this market. ` +
                    `${describeApiError(configQuery.error).title}`
                  }
                  className="mt-3"
                />
              )}

            {configQuery.data && (
              <div className="mt-4">
                <p className="text-sm font-semibold">
                  Duration
                </p>

                {validDurationPresets.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {validDurationPresets.map((preset) => (
                      <button
                        key={preset.seconds}
                        type="button"
                        onClick={() =>
                          setDurationSeconds(
                            preset.seconds,
                          )
                        }
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                          durationSeconds === preset.seconds
                            ? 'bg-brand-500 text-navy-950'
                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    type="number"
                    min={minDurationSeconds}
                    max={maxDurationSeconds}
                    value={durationSeconds ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;

                      setDurationSeconds(
                        value === ''
                          ? null
                          : Number(value),
                      );
                    }}
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-3 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* SUMMARY */}

        <aside className="h-fit rounded-2xl bg-navy-950 p-5 text-white shadow-sm sm:p-6">
          <p className="text-sm font-semibold text-white/65">
            Bet summary
          </p>

          <h2 className="mt-1 text-xl font-bold">
            {product.title}
          </h2>

          <dl className="mt-5 space-y-4 text-sm">
            <Row
              label="Direction"
              value={selection}
            />

            <Row
              label="Stake"
              value={
                minorStake !== null && instrument
                  ? formatCurrencyMinorUnits(
                      minorStake.toString(),
                      instrument.quoteCurrency,
                    )
                  : '—'
              }
            />

            <Row
              label="Duration"
              value={
                durationSeconds !== null
                  ? DURATION_PRESETS.find(
                      (preset) =>
                        preset.seconds === durationSeconds,
                    )?.label ??
                    `${durationSeconds}s`
                  : '—'
              }
            />

            <Row
              label="Payout rate (est.)"
              value={
                configQuery.data
                  ? `${(
                      Number(
                        configQuery.data
                          .payoutRateBasisPoints,
                      ) / 100
                    ).toFixed(2)}% profit`
                  : '—'
              }
            />

            <Row
              label="Potential return (est.)"
              value={
                estimatedPayoutMinorUnits !== null &&
                instrument
                  ? `~${formatCurrencyMinorUnits(
                      estimatedPayoutMinorUnits.toString(),
                      instrument.quoteCurrency,
                    )}`
                  : '—'
              }
            />
          </dl>

          <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-white/55">
            Estimates are for reference only.
            The server determines the authoritative
            market price, entry price, odds, and final
            return when you confirm the bet.
          </p>

          {instrument && priceQuery.error && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-xs text-white/60">
                Market quote is updating. Betting
                controls remain available while the
                server validates the market at
                confirmation.
              </p>
            </div>
          )}

          {instrument &&
            instrument.status !== 'active' && (
              <Notice
                text="This market is currently closed."
                className="mt-3"
              />
            )}

          {configQuery.data &&
            !configQuery.data.isEnabled && (
              <Notice
                text={`${product.title} is not currently available for this market.`}
                className="mt-3"
              />
            )}

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
          stake={
            minorStake !== null
              ? formatCurrencyMinorUnits(
                  minorStake.toString(),
                  instrument.quoteCurrency,
                )
              : '—'
          }
          estimate={
            estimatedPayoutMinorUnits !== null
              ? formatCurrencyMinorUnits(
                  estimatedPayoutMinorUnits.toString(),
                  instrument.quoteCurrency,
                )
              : '—'
          }
          submitting={submitting}
          error={submitError}
          onCancel={() =>
            !submitting && setReviewing(false)
          }
          onConfirm={confirmBet}
        />
      )}

      <BetsPanel instruments={instruments} />
    </section>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-white/60">
        {label}
      </dt>

      <dd className="font-semibold capitalize">
        {value}
      </dd>
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
  error: {
    title: string;
    canRetry: boolean;
  } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const closeIfIdle = () => {
    if (!submitting) {
      onCancel();
    }
  };

  const containerRef =
    useDialogA11y<HTMLDivElement>(closeIfIdle);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-navy-950/50 p-0 sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Review bet"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="w-full rounded-t-3xl bg-white p-6 shadow-xl outline-none sm:max-w-md sm:rounded-3xl"
      >
        <ShieldCheck
          className="h-8 w-8 text-brand-500"
          aria-hidden="true"
        />

        <h2 className="mt-3 text-2xl font-bold">
          Review your bet
        </h2>

        <p className="mt-2 text-sm text-neutral-600">
          {product} ·{' '}
          <span className="font-semibold capitalize">
            {selection}
          </span>
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

        {error && (
          <Notice
            text={error.title}
            className="mt-4"
          />
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="w-full rounded-full border border-neutral-200 py-3 font-semibold transition hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="flex w-full items-center justify-center rounded-full bg-brand-500 py-3 font-bold transition hover:bg-brand-600 disabled:opacity-50"
          >
            {submitting ? (
              <LoaderCircle
                className="h-5 w-5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              'Confirm bet'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
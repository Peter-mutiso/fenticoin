'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { KNOWN_CURRENCIES, Money } from '@fenticoin/domain';

import { upsertBettingConfig, type BetType, type BettingConfig } from '@/lib/api-client';
import { parseAmountToMinorUnits } from '@/lib/money';

/** Float-free minor-units-to-decimal-string conversion, for pre-filling a form field from an existing value — never `Number(x)/100`. */
function toDecimalInput(minorUnits: string, currencyCode: string): string {
  const currency = KNOWN_CURRENCIES[currencyCode] ?? { code: currencyCode, decimals: 2 };
  return Money.fromMinorUnits(BigInt(minorUnits), currency).toDecimalString();
}
import { RequirePermission } from '@/components/auth/RequirePermission';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Notice } from '@/components/ui/Notice';
import { useConfirmedAction } from '@/lib/useConfirmedAction';

const DURATION_OPTIONS = [
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '1h', seconds: 3_600 },
  { label: '1d', seconds: 86_400 },
];

/** One (instrument, bet type) odds/limit rule. Every submission requires proper validation before it reaches the server — min ≤ max, positive payout rate, min ≤ max duration — the server enforces this too, but failing fast client-side avoids a round trip for an obviously invalid rule. */
export function BettingConfigForm({ instrumentId, betType, currency, existing }: { instrumentId: string; betType: BetType; currency: string; existing?: BettingConfig }) {
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmedAction();

  const [minStake, setMinStake] = useState(existing ? toDecimalInput(existing.minStakeMinorUnits, currency) : '');
  const [maxStake, setMaxStake] = useState(existing ? toDecimalInput(existing.maxStakeMinorUnits, currency) : '');
  const [payoutPercent, setPayoutPercent] = useState(existing ? toDecimalInput(existing.payoutRateBasisPoints, 'USD') : '');
  const [minDuration, setMinDuration] = useState(existing ? Number(existing.minDurationSeconds) : 30);
  const [maxDuration, setMaxDuration] = useState(existing ? Number(existing.maxDurationSeconds) : 86_400);
  const [isEnabled, setIsEnabled] = useState(existing?.isEnabled ?? true);

  let minMinor: bigint | null = null;
  let maxMinor: bigint | null = null;
  let payoutBps: bigint | null = null;
  try {
    minMinor = minStake.trim() ? parseAmountToMinorUnits(minStake, currency) : null;
    maxMinor = maxStake.trim() ? parseAmountToMinorUnits(maxStake, currency) : null;
    // Basis points are exactly "percent scaled to 2 decimal places" — the
    // same shape a 2-decimal currency amount has (85.00 -> 8500 minor
    // units), so the same float-free parser applies; 'USD' here is only
    // ever used for its 2-decimals shape, never as an actual currency.
    payoutBps = payoutPercent.trim() ? parseAmountToMinorUnits(payoutPercent, 'USD') : null;
  } catch {
    minMinor = null;
    maxMinor = null;
    payoutBps = null;
  }

  const validationError =
    minMinor === null || minMinor <= 0n
      ? 'Minimum stake must be a positive amount.'
      : maxMinor === null || maxMinor < minMinor
        ? 'Maximum stake must be greater than or equal to the minimum.'
        : payoutBps === null || payoutBps <= 0n
          ? 'Payout rate must be a positive percentage.'
          : minDuration <= 0 || maxDuration < minDuration
            ? 'Maximum duration must be greater than or equal to the minimum.'
            : null;

  const canSubmit = !validationError;

  async function doSubmit(): Promise<void> {
    if (minMinor === null || maxMinor === null || payoutBps === null) return;
    await upsertBettingConfig({
      instrumentId,
      betType,
      minStake: minMinor.toString(),
      maxStake: maxMinor.toString(),
      payoutRateBasisPoints: payoutBps.toString(),
      minDurationSeconds: minDuration,
      maxDurationSeconds: maxDuration,
      isEnabled,
    });
    await queryClient.invalidateQueries({ queryKey: ['betting-configs'] });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    confirm({
      title: `Save ${betType.replace('_', ' / ')} configuration?`,
      description: `This changes real stake limits and payout odds for every future bet on this market — min ${minStake} / max ${maxStake} ${currency}, ${payoutPercent}% payout, ${isEnabled ? 'enabled' : 'disabled'}.`,
      onConfirm: () => doSubmit(),
      successMessage: 'Betting configuration saved',
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-neutral-900 capitalize">{betType.replace('_', ' / ')}</p>
        <label className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
          <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} className="rounded border-neutral-300" />
          Enabled
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-neutral-600">
          Min stake ({currency})
          <input value={minStake} onChange={(event) => setMinStake(event.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
        </label>
        <label className="text-xs font-semibold text-neutral-600">
          Max stake ({currency})
          <input value={maxStake} onChange={(event) => setMaxStake(event.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
        </label>
        <label className="text-xs font-semibold text-neutral-600">
          Payout rate (% profit)
          <input value={payoutPercent} onChange={(event) => setPayoutPercent(event.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
        </label>
        <div className="text-xs font-semibold text-neutral-600" id={`${instrumentId}-${betType}-duration-label`}>
          Duration range
          <div className="mt-1 flex items-center gap-2">
            <select
              value={minDuration}
              onChange={(event) => setMinDuration(Number(event.target.value))}
              aria-label="Minimum duration"
              aria-describedby={`${instrumentId}-${betType}-duration-label`}
              className="w-full rounded-xl border border-neutral-200 bg-white px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              {DURATION_OPTIONS.map((option) => (
                <option key={option.seconds} value={option.seconds}>
                  {option.label}
                </option>
              ))}
            </select>
            <span aria-hidden="true">–</span>
            <select
              value={maxDuration}
              onChange={(event) => setMaxDuration(Number(event.target.value))}
              aria-label="Maximum duration"
              aria-describedby={`${instrumentId}-${betType}-duration-label`}
              className="w-full rounded-xl border border-neutral-200 bg-white px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              {DURATION_OPTIONS.map((option) => (
                <option key={option.seconds} value={option.seconds}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {validationError && <Notice text={validationError} className="mt-3" />}

      <RequirePermission permission="odds.manage">
        <button type="submit" disabled={!canSubmit} className="mt-4 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
          Save
        </button>
        <ConfirmDialog {...dialogProps} />
      </RequirePermission>
    </form>
  );
}

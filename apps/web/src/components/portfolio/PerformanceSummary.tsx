import type { Bet } from '@/lib/api-client';
import { formatCurrencyMinorUnits } from '@/lib/money';

/**
 * Pure client-side arithmetic over whatever settled bets are currently
 * loaded — there is no server-side lifetime-performance aggregate endpoint,
 * so this is explicitly scoped and labeled as "based on your last N settled
 * bets" rather than presented as a complete lifetime statistic.
 */
export function PerformanceSummary({ settledBets, currency }: { settledBets: Bet[]; currency: string }) {
  if (settledBets.length === 0) return null;

  let totalStaked = 0n;
  let totalReturned = 0n;
  for (const bet of settledBets) {
    totalStaked += BigInt(bet.stakeAmountMinorUnits);
    if (bet.result === 'win') totalReturned += BigInt(bet.potentialPayoutMinorUnits);
    else if (bet.result === 'push') totalReturned += BigInt(bet.stakeAmountMinorUnits);
  }
  const net = totalReturned - totalStaked;
  const wins = settledBets.filter((bet) => bet.result === 'win').length;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
      <p className="text-sm font-semibold text-neutral-900">Performance</p>
      <p className="mt-0.5 text-xs text-neutral-500">Based on your last {settledBets.length} settled bet{settledBets.length === 1 ? '' : 's'}</p>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Staked" value={formatCurrencyMinorUnits(totalStaked.toString(), currency)} />
        <Stat label="Returned" value={formatCurrencyMinorUnits(totalReturned.toString(), currency)} />
        <Stat
          label="Net"
          value={`${net >= 0n ? '+' : '-'}${formatCurrencyMinorUnits((net < 0n ? -net : net).toString(), currency)}`}
          tone={net >= 0n ? 'positive' : 'negative'}
        />
        <Stat label="Win rate" value={`${Math.round((wins / settledBets.length) * 100)}%`} />
      </dl>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-bold tabular-nums ${tone === 'positive' ? 'text-brand-700' : tone === 'negative' ? 'text-loss-700' : 'text-neutral-900'}`}>
        {value}
      </dd>
    </div>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';

import { listBettingConfigs, type BetType } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { Notice } from '@/components/ui/Notice';
import { BettingConfigForm } from './BettingConfigForm';

const BET_TYPES: BetType[] = ['rise_fall', 'higher_lower', 'up_down'];

export function BettingConfigsPanel({ instrumentId, quoteCurrency }: { instrumentId: string; quoteCurrency: string }) {
  const query = useQuery({ queryKey: ['betting-configs', instrumentId], queryFn: () => listBettingConfigs(instrumentId) });

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
        ))}
      </div>
    );
  }
  if (query.error) return <Notice text={describeApiError(query.error).title} />;

  const byType = new Map(query.data!.items.map((config) => [config.betType, config]));

  return (
    <div className="space-y-3">
      {BET_TYPES.map((betType) => (
        <BettingConfigForm key={betType} instrumentId={instrumentId} betType={betType} currency={quoteCurrency} existing={byType.get(betType)} />
      ))}
    </div>
  );
}

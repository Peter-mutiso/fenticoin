'use client';

import { useQuery } from '@tanstack/react-query';

import { getPrice } from '@/lib/api-client';
import { useInstrumentRealtimeSubscription } from '@/lib/realtime/RealtimeProvider';
import { PriceQuoteBadge } from './PriceQuoteBadge';

/** Self-contained price fetch for one instrument — polls every 5s as the baseline/fallback, and joins the instrument's real-time room so a fresh tick refetches sooner when the socket is connected. */
export function InstrumentPrice({
  instrumentId,
  currency,
  className,
  compact = false,
}: {
  instrumentId: string;
  currency: string;
  className?: string;
  compact?: boolean;
}) {
  useInstrumentRealtimeSubscription(instrumentId);
  const priceQuery = useQuery({
    queryKey: ['price', instrumentId],
    queryFn: () => getPrice(instrumentId),
    refetchInterval: 5_000,
  });

  return <PriceQuoteBadge price={priceQuery.data} currency={currency} loading={priceQuery.isLoading} className={className} compact={compact} />;
}

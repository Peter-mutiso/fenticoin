import { Suspense } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { BettingExperience } from '@/components/betting/BettingExperience';

/**
 * The dedicated trading workspace — the same real, server-authoritative
 * trading experience as the dashboard's bet builder (`BettingExperience`):
 * live instrument/quote selection, direction, stake with server-config
 * min/max + balance validation, a review step, and — via `BetsPanel` — the
 * open-positions/settlement/history view for everything placed here. This
 * intentionally reuses that one implementation rather than duplicating a
 * second trading UI against the same `placeBet` pipeline: two parallel
 * front ends drifting out of sync (validation rules, duration bounds,
 * missing history) is exactly the failure mode a single shared component
 * avoids. Anonymous visitors can still browse markets/quotes here;
 * `BettingExperience` itself shows a "log in to trade" prompt in place of
 * the wallet/placement controls rather than this page redirecting them away.
 */
export default function TradePage() {
  return (
    <AppShell>
      <Suspense>
        <BettingExperience />
      </Suspense>
    </AppShell>
  );
}

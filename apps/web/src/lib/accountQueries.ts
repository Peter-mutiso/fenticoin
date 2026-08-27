import type { QueryClient } from '@tanstack/react-query';

/**
 * Every query-key prefix whose cached data is scoped to "whichever
 * account is currently active" — wallet balance, bets/open positions,
 * bots, and transaction history. Switching between REAL and DEMO (or
 * resetting the demo account) swaps which account's rows those endpoints
 * return for the *same* query key, so a stale cached value from the
 * account you just left could otherwise flash on screen until each
 * query's own refetch interval comes around. Shared by the header account
 * switcher, the demo enter/exit flow, and the demo reset dialog, so every
 * way an account's active state changes behaves identically — this is
 * the one place that list lives.
 */
const ACCOUNT_SCOPED_QUERY_KEY_PREFIXES: readonly unknown[][] = [
  ['wallet'],
  ['wallet-transactions'],
  ['bets'],
  ['bot'],
  ['bots'],
];

/** Invalidates every account-scoped query so the UI refetches under the (possibly new) active account instead of showing stale cached data. */
export function invalidateAccountScopedQueries(queryClient: QueryClient): Promise<void[]> {
  return Promise.all(
    ACCOUNT_SCOPED_QUERY_KEY_PREFIXES.map((queryKey) => queryClient.invalidateQueries({ queryKey, exact: false })),
  );
}

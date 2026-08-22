/**
 * Deliberately plain constants rather than an admin-configurable table
 * (contrast `betting_configs`) — payment limits are a good future
 * candidate for the same treatment, but that's out of scope until a real
 * provider (with its own limits) is chosen.
 */

/** How long a `pending` deposit stays valid before the expiry sweep marks it `expired`. */
export const DEPOSIT_EXPIRY_MINUTES = 30;

export const MIN_WITHDRAWAL_MINOR_UNITS = 1_000n; // $10.00
export const MAX_WITHDRAWAL_MINOR_UNITS = 100_000_000n; // $1,000,000.00 — generous outer bound

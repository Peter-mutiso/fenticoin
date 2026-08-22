import { ApiError, NetworkError, SessionExpiredError } from './api-client';

export interface DescribedError {
  title: string;
  canRetry: boolean;
}

/** Turns any thrown value from an api-client call into user-facing copy, consistently across every page. */
export function describeApiError(error: unknown): DescribedError {
  if (error instanceof SessionExpiredError) {
    return { title: error.message, canRetry: false };
  }
  if (error instanceof NetworkError) {
    return { title: error.message, canRetry: true };
  }
  if (error instanceof ApiError) {
    // Server messages here are already written for end users (see
    // AllExceptionsFilter) — insufficient balance, market closed, stale
    // price, invalid stake/duration, exposure limits all arrive as clear
    // text, so there is no need to re-derive UI copy per status code.
    return { title: error.message, canRetry: error.status >= 500 };
  }
  return { title: 'Something went wrong. Please try again.', canRetry: true };
}

/** True when the failure is the expected "no payment provider configured yet" case, not a genuine error. */
export function isProviderNotConfiguredError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 500;
}

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
    // Server messages are already written for end users (see
    // AllExceptionsFilter) — insufficient permission, validation errors,
    // conflicts all arrive as clear text.
    return { title: error.message, canRetry: error.status >= 500 };
  }
  return { title: 'Something went wrong. Please try again.', canRetry: true };
}

'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO(observability): forward to an error-tracking service (e.g. Sentry)
    // once one is wired up. Never log raw error details to the client console
    // in production beyond what Next.js already provides.
    console.error('Unhandled route error', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-neutral-600">
        An unexpected error occurred. Reference: {error.digest ?? 'n/a'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
      >
        Try again
      </button>
    </main>
  );
}

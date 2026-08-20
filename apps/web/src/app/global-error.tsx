'use client';

/**
 * Catches errors thrown by the root layout itself, where `error.tsx` cannot
 * help since it lives inside that layout. Must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1.5rem' }}>
          <h1>Something went wrong</h1>
          <p>A critical error occurred. Reference: {error.digest ?? 'n/a'}</p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

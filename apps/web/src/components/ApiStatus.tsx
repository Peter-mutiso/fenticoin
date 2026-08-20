'use client';

import { useQuery } from '@tanstack/react-query';

import { getLiveness } from '@/lib/api-client';

/**
 * Client-side proof that the frontend can reach the backend. Fetches after
 * hydration, in the browser — never at build time — so `next build` never
 * depends on the API being reachable.
 */
export function ApiStatus() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['health', 'liveness'],
    queryFn: getLiveness,
  });

  if (isLoading) {
    return <p className="text-sm text-neutral-500">Checking API connection…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-red-500" role="status">
        API unreachable ({error instanceof Error ? error.message : 'unknown error'})
      </p>
    );
  }

  return (
    <p className="text-sm text-green-600" role="status">
      API status: {data?.status} (uptime {data?.uptimeSeconds}s)
    </p>
  );
}

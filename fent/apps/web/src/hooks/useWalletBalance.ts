'use client';

import { useQuery } from '@tanstack/react-query';

import { getWallet } from '@/lib/api-client';
import { useAuth } from '@/lib/auth/AuthContext';

/** The user's real, server-derived available balance — never client-computed. `enabled` only once we actually have a session. */
export function useWalletBalance(currency = 'USD') {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['wallet', currency],
    queryFn: () => getWallet(currency),
    enabled: status === 'authenticated',
    refetchInterval: status === 'authenticated' ? 10_000 : false,
  });
}

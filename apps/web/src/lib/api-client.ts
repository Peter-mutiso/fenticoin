import type { LivenessResponse } from '@fenticoin/types';

import { getPublicEnv } from './env';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Minimal fetch wrapper. Grows into the real API client in a later phase. */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { NEXT_PUBLIC_API_URL } = getPublicEnv();
  const response = await fetch(`${NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    throw new ApiError(`Request to ${path} failed with status ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}

export function getLiveness(): Promise<LivenessResponse> {
  return apiFetch<LivenessResponse>('/health');
}

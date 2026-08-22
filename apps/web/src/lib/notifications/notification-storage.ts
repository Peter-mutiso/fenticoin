import type { AppNotification } from './types';

/**
 * The one place notification state touches `localStorage`, mirroring
 * `lib/auth/token-storage.ts`. Namespaced per user id so switching accounts
 * on the same browser never surfaces another user's settlement/payment
 * history — inert until that same user logs back in.
 */
const MAX_STORED = 100;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function storageKey(userId: string): string {
  return `fenticoin.notifications.${userId}`;
}

export function getStoredNotifications(userId: string): AppNotification[] {
  if (!isBrowser()) return [];
  const raw = window.localStorage.getItem(storageKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function storeNotifications(userId: string, notifications: AppNotification[]): void {
  if (!isBrowser()) return;
  const capped = notifications.slice(0, MAX_STORED);
  window.localStorage.setItem(storageKey(userId), JSON.stringify(capped));
}

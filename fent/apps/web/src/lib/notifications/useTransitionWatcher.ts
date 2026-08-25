import { useEffect, useRef } from 'react';

/**
 * Generic version of the diff-on-poll pattern: given a freshly-polled list,
 * fires `onTransition` for each item whose status changed since the last
 * render — but never on first hydration (mount), so pre-existing terminal
 * state (e.g. a bet that was already `won` before this component ever
 * mounted) doesn't generate a spurious transition.
 */
export function useTransitionWatcher<T, S extends string>(
  items: T[],
  getId: (item: T) => string,
  getStatus: (item: T) => S,
  onTransition: (item: T, previousStatus: S, nextStatus: S) => void,
): void {
  const previousStatuses = useRef<Map<string, S>>(new Map());
  const hasHydrated = useRef(false);

  useEffect(() => {
    if (items.length === 0) return;

    for (const item of items) {
      const id = getId(item);
      const nextStatus = getStatus(item);
      const previousStatus = previousStatuses.current.get(id);

      if (hasHydrated.current && previousStatus !== undefined && previousStatus !== nextStatus) {
        onTransition(item, previousStatus, nextStatus);
      }
      previousStatuses.current.set(id, nextStatus);
    }
    hasHydrated.current = true;
  }, [items, getId, getStatus, onTransition]);
}

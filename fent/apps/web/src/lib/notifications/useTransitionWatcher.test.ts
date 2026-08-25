import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';

import { useTransitionWatcher } from './useTransitionWatcher';

interface Item {
  id: string;
  status: 'open' | 'won' | 'lost';
}

function useHarness(initial: Item[]) {
  const [items, setItems] = useState(initial);
  // A stable mock identity across renders — otherwise a fresh jest.fn() per
  // render would discard prior call history before assertions can see it.
  const onTransitionRef = useRef(jest.fn());
  useTransitionWatcher(
    items,
    (item: Item) => item.id,
    (item: Item) => item.status,
    onTransitionRef.current,
  );
  return { items, setItems, onTransition: onTransitionRef.current };
}

describe('useTransitionWatcher', () => {
  it('does not fire on first hydration, even if items already have a terminal status', () => {
    const { result } = renderHook(() => useHarness([{ id: 'a', status: 'won' }]));
    expect(result.current.onTransition).not.toHaveBeenCalled();
  });

  it('fires exactly once for a genuine in-session status change', () => {
    const { result, rerender } = renderHook(() => useHarness([{ id: 'a', status: 'open' }]));

    act(() => result.current.setItems([{ id: 'a', status: 'won' }]));
    rerender();

    expect(result.current.onTransition).toHaveBeenCalledTimes(1);
    expect(result.current.onTransition).toHaveBeenCalledWith({ id: 'a', status: 'won' }, 'open', 'won');
  });

  it('does not re-fire when the same status is observed again on a later poll', () => {
    const { result, rerender } = renderHook(() => useHarness([{ id: 'a', status: 'open' }]));

    act(() => result.current.setItems([{ id: 'a', status: 'won' }]));
    rerender();
    act(() => result.current.setItems([{ id: 'a', status: 'won' }]));
    rerender();

    expect(result.current.onTransition).toHaveBeenCalledTimes(1);
  });

  it('tracks multiple items independently', () => {
    const { result, rerender } = renderHook(() =>
      useHarness([
        { id: 'a', status: 'open' },
        { id: 'b', status: 'open' },
      ]),
    );

    act(() =>
      result.current.setItems([
        { id: 'a', status: 'won' },
        { id: 'b', status: 'open' },
      ]),
    );
    rerender();

    expect(result.current.onTransition).toHaveBeenCalledTimes(1);
    expect(result.current.onTransition).toHaveBeenCalledWith({ id: 'a', status: 'won' }, 'open', 'won');
  });
});

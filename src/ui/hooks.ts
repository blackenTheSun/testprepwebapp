import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Observable } from '../engine/observable';

/** Re-renders the component whenever the engine object notifies a change. */
export function useObservable(target: Observable | undefined): number {
  return useSyncExternalStore(
    target ? target.subscribe : noopSubscribe,
    () => target?.version ?? 0,
  );
}

const noopSubscribe = () => () => {};

/** Re-renders every `ms` while `active` (for the live timer display). */
export function useTicker(active: boolean, ms = 250): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
}

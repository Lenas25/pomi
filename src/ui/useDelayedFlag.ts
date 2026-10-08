import { useEffect, useState } from 'react';

/** HANDOFF §8: skeletons only appear when a load takes longer than this. */
export const SKELETON_DELAY_MS = 300;

/** `true` once `active` has been true for `delayMs` without a break (false immediately after). */
export function useDelayedFlag(active: boolean, delayMs: number = SKELETON_DELAY_MS): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, delayMs]);
  return active && elapsed;
}

import { useEffect, useState } from 'react';

/** Re-renders every `intervalMs` while `enabled`, returning the current epoch ms. */
export function useNow(enabled: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const update = () => setNow(Date.now());
    // An immediate refresh (outside the effect body) avoids showing a stale value for one tick.
    const first = setTimeout(update, 0);
    const id = setInterval(update, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [enabled, intervalMs]);
  return now;
}

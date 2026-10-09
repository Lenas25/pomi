// Shared "data changed" signal: writes made outside a hub (the quick-add sheet over Hoy or
// Hábitos) bump the tick, and the hubs underneath reload. The modal sheet does not blur the
// screen below, so focus effects alone would leave it stale.
import { useEffect, useRef } from 'react';
import { create } from 'zustand';

type DataVersionState = { version: number };

export const useDataVersion = create<DataVersionState>(() => ({ version: 0 }));

/** Call after a write that a visible hub must show (quick add: water, a habit, the food note). */
export function bumpDataVersion(): void {
  useDataVersion.setState((state) => ({ version: state.version + 1 }));
}

/** Runs `reload` whenever the data version changes after mount (not on mount itself). */
export function useReloadOnDataChange(reload: () => unknown): void {
  const version = useDataVersion((state) => state.version);
  const seen = useRef(version);
  useEffect(() => {
    if (seen.current === version) return;
    seen.current = version;
    void reload();
  }, [version, reload]);
}

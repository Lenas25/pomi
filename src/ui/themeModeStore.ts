import { create } from 'zustand';

import type { ThemeMode } from './theme';

type ThemeModeState = {
  mode: ThemeMode;
  /** Changes the mode and persists it (when persistence has been configured). */
  setMode: (mode: ThemeMode) => void;
  /** Sets the mode without persisting; used to load the stored value at startup. */
  hydrate: (mode: ThemeMode) => void;
};

type Persist = (mode: ThemeMode) => Promise<void>;

let persist: Persist | null = null;

/** Wired at startup to the settings repository, keeping this store free of database imports. */
export function setThemeModePersistence(next: Persist | null): void {
  persist = next;
}

export const useThemeModeStore = create<ThemeModeState>((set) => ({
  mode: 'system',
  setMode: (mode) => {
    set({ mode });
    // Best effort: the UI already changed, so a failed write must not break the app.
    persist?.(mode).catch(() => undefined);
  },
  hydrate: (mode) => set({ mode }),
}));

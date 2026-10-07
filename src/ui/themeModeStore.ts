import { create } from 'zustand';

import type { ThemeMode } from './theme';

type ThemeModeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

// In-memory for now. It will be backed by the `settings` table once the database lands (M1).
export const useThemeModeStore = create<ThemeModeState>((set) => ({
  mode: 'system',
  setMode: (mode) => set({ mode }),
}));

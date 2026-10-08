import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { setThemeModePersistence, useThemeModeStore } from './themeModeStore';

afterEach(() => {
  setThemeModePersistence(null);
  useThemeModeStore.getState().hydrate('system');
});

describe('themeModeStore persistence', () => {
  it('persists setMode but not hydrate', () => {
    const persist = jest.fn<(mode: 'system' | 'light' | 'dark') => Promise<void>>(() =>
      Promise.resolve(),
    );
    setThemeModePersistence(persist);

    useThemeModeStore.getState().hydrate('dark');
    expect(useThemeModeStore.getState().mode).toBe('dark');
    expect(persist).not.toHaveBeenCalled();

    useThemeModeStore.getState().setMode('light');
    expect(useThemeModeStore.getState().mode).toBe('light');
    expect(persist).toHaveBeenCalledWith('light');
  });

  it('keeps the new mode when persisting fails', async () => {
    setThemeModePersistence(() => Promise.reject(new Error('disk full')));
    useThemeModeStore.getState().setMode('dark');
    await Promise.resolve();
    expect(useThemeModeStore.getState().mode).toBe('dark');
  });
});

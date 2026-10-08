import { en } from './en';
import { es } from './es';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { resolveLanguage, setLanguagePersistence, useLocaleStore, useT } from './index';

function flatten(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe('i18n', () => {
  it('has the same keys in es and en', () => {
    expect(flatten(en).sort()).toEqual(flatten(es).sort());
  });

  it('defaults to Spanish unless the device language is English', () => {
    expect(resolveLanguage('system', 'en')).toBe('en');
    expect(resolveLanguage('system', 'fr')).toBe('es');
    expect(resolveLanguage('system', undefined)).toBe('es');
    expect(resolveLanguage('es', 'en')).toBe('es');
  });

  describe('reactive language', () => {
    afterEach(async () => {
      setLanguagePersistence(null);
      await act(async () => {
        useLocaleStore.getState().hydrate('es');
      });
    });

    function Title() {
      const t = useT();
      return <Text>{t('tabs.hoy')}</Text>;
    }

    it('re-renders components using useT() when the language changes', async () => {
      useLocaleStore.getState().hydrate('es');
      await render(<Title />);
      expect(screen.getByText(es.tabs.hoy)).toBeTruthy();
      await act(async () => {
        useLocaleStore.getState().setPreference('en');
      });
      expect(screen.getByText(en.tabs.hoy)).toBeTruthy();
    });

    it('persists setPreference but not hydrate', () => {
      const persist = jest.fn(() => Promise.resolve());
      setLanguagePersistence(persist);
      useLocaleStore.getState().hydrate('en');
      expect(persist).not.toHaveBeenCalled();
      useLocaleStore.getState().setPreference('es');
      expect(persist).toHaveBeenCalledWith('es');
    });
  });
});

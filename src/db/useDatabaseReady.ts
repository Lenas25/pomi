import { useEffect, useState } from 'react';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { setLanguagePersistence, useLocaleStore } from '../i18n';
import { setThemeModePersistence, useThemeModeStore } from '../ui/themeModeStore';

import { db, migrations, repositories } from './index';

export type DatabaseStatus = 'loading' | 'ready' | 'error';

/**
 * Applies pending migrations, seeds the bundled templates on first run and hydrates the theme
 * mode and language from settings. Render nothing (keep the splash) until the status is not `loading`.
 */
export function useDatabaseReady(): DatabaseStatus {
  const { success, error } = useMigrations(db, migrations);
  const [bootstrapped, setBootstrapped] = useState<'pending' | 'done' | 'failed'>('pending');

  useEffect(() => {
    if (!success) return;
    let cancelled = false;
    (async () => {
      try {
        await repositories.templates.seedDefaults();
        const mode = await repositories.settings.get('themeMode');
        if (mode) useThemeModeStore.getState().hydrate(mode);
        setThemeModePersistence((next) => repositories.settings.set('themeMode', next));
        const language = await repositories.settings.get('language');
        useLocaleStore.getState().hydrate(language ?? 'system');
        // 'system' is stored as "no value", so the device language keeps being followed.
        setLanguagePersistence((next) =>
          next === 'system'
            ? repositories.settings.remove('language')
            : repositories.settings.set('language', next),
        );
        if (!cancelled) setBootstrapped('done');
      } catch {
        if (!cancelled) setBootstrapped('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [success]);

  if (error || bootstrapped === 'failed') return 'error';
  return success && bootstrapped === 'done' ? 'ready' : 'loading';
}

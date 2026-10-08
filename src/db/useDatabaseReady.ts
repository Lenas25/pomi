import { useEffect, useState } from 'react';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { useOnboardingStatusStore } from '../onboarding/statusStore';
import { setLanguagePersistence, useLocaleStore } from '../i18n';
import { setThemeModePersistence, useThemeModeStore } from '../ui/themeModeStore';

import { getDatabase, getRepositories, migrations } from './index';

export type DatabaseStatus = 'loading' | 'ready' | 'error';

async function runBootstrap(): Promise<void> {
  // Opening the file happens here (not at import) so any failure reaches the error screen.
  await migrate(getDatabase(), migrations);
  const repositories = getRepositories();
  await repositories.templates.seedDefaults();
  const mode = await repositories.settings.get('themeMode');
  if (mode) useThemeModeStore.getState().hydrate(mode);
  setThemeModePersistence((next) => repositories.settings.set('themeMode', next));
  const language = await repositories.settings.get('language');
  useLocaleStore.getState().hydrate(language ?? 'system');
  const onboardingDone = await repositories.settings.get('onboardingComplete');
  useOnboardingStatusStore.getState().setComplete(onboardingDone === true);
  // 'system' is stored as "no value", so the device language keeps being followed.
  setLanguagePersistence((next) =>
    next === 'system'
      ? repositories.settings.remove('language')
      : repositories.settings.set('language', next),
  );
}

let bootstrapPromise: Promise<void> | undefined;

/**
 * Runs the bootstrap once per process. Module-level so React StrictMode's double effect (or a
 * remount) shares one run instead of racing two migrations. A failure is not cached, so a later
 * mount can retry.
 */
export function bootstrapDatabase(): Promise<void> {
  bootstrapPromise ??= runBootstrap().catch((error: unknown) => {
    bootstrapPromise = undefined;
    throw error;
  });
  return bootstrapPromise;
}

/**
 * Opens the database, applies pending migrations, seeds the bundled templates on first run and
 * hydrates the theme mode and language from settings. Render nothing (keep the splash) until the
 * status is not `loading`.
 */
export function useDatabaseReady(): DatabaseStatus {
  const [status, setStatus] = useState<DatabaseStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    bootstrapDatabase().then(
      () => {
        if (!cancelled) setStatus('ready');
      },
      (error: unknown) => {
        if (__DEV__) console.error('Database bootstrap failed', error);
        if (!cancelled) setStatus('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}

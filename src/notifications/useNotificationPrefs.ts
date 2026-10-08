import { useCallback, useEffect, useState } from 'react';

import { getRepositories } from '../db';
import type { SettingsValue } from '../db/repositories/settings';

import { requestNotificationSync } from './sync';

export type NotificationPrefs = SettingsValue<'notificationPrefs'>;

/** Reads the notification preferences; every change is saved and refills the scheduled window. */
export function useNotificationPrefs() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRepositories()
      .settings.get('notificationPrefs')
      .then((stored) => {
        if (!cancelled) setPrefs(stored ?? {});
      })
      .catch(() => {
        if (!cancelled) setPrefs({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (patch: Partial<NotificationPrefs>) => {
    const settings = getRepositories().settings;
    try {
      const current = (await settings.get('notificationPrefs')) ?? {};
      const next = { ...current, ...patch };
      // `exactOptionalPropertyTypes`-safe: an undefined patch value removes the key.
      const clean = Object.fromEntries(
        Object.entries(next).filter(([, value]) => value !== undefined),
      ) as NotificationPrefs;
      await settings.set('notificationPrefs', clean);
      setPrefs(clean);
      setFailed(false);
      void requestNotificationSync('settingsChanged');
    } catch {
      setFailed(true);
    }
  }, []);

  return { prefs, update, failed };
}

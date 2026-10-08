import { useCallback, useEffect, useState } from 'react';

import { getRepositories } from '../db';
import type { SettingsValue } from '../db/repositories/settings';

import { requestNotificationSync } from './sync';

export type NotificationPrefs = SettingsValue<'notificationPrefs'>;

/** Shallow merge; an `undefined` patch value removes the key (back to the default behaviour). */
export function mergeNotificationPrefs(
  current: NotificationPrefs,
  patch: Partial<NotificationPrefs>,
): NotificationPrefs {
  return Object.fromEntries(
    Object.entries({ ...current, ...patch }).filter(([, value]) => value !== undefined),
  ) as NotificationPrefs;
}

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
      let saved: NotificationPrefs = {};
      // Read-modify-write inside the settings mutex: fast stepper taps never lose an update.
      await settings.update('notificationPrefs', (current) => {
        saved = mergeNotificationPrefs(current ?? {}, patch);
        return saved;
      });
      setPrefs(saved);
      setFailed(false);
      void requestNotificationSync('settingsChanged');
    } catch {
      setFailed(true);
    }
  }, []);

  return { prefs, update, failed };
}

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getRepositories } from '../db';
import type { SettingsValue } from '../db/repositories/settings';
import type { SedentaryConfig } from '../domain/sedentary';
import { getHealthAdapter } from '../health';
import { refreshBackgroundSchedule } from '../notifications/backgroundTasks';

import { ensureNudgePermissions, nudgePermissionState } from './enable';
import { resolveSedentaryConfig } from './runNudge';

type Stored = SettingsValue<'sedentaryNudge'>;

export type SedentaryNotice =
  | 'unavailable'
  | 'denied'
  | 'bgDenied'
  | 'featureUnavailable'
  | 'missingPermission'
  | 'requestFailed'
  | 'saveFailed'
  | null;

/** Reads and saves the nudge preferences; the background job follows every change. */
export function useSedentarySettings() {
  const [config, setConfig] = useState<SedentaryConfig | null>(null);
  const [notice, setNotice] = useState<SedentaryNotice>(null);

  useEffect(() => {
    let cancelled = false;
    getRepositories()
      .settings.get('sedentaryNudge')
      .then((stored) => {
        if (!cancelled) setConfig(resolveSedentaryConfig(stored));
      })
      .catch(() => {
        if (!cancelled) setConfig(resolveSedentaryConfig(undefined));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (patch: Partial<SedentaryConfig>) => {
    const settings = getRepositories().settings;
    try {
      // Read-modify-write inside the settings mutex: fast toggles never lose each other's patch.
      const next = await settings.update(
        'sedentaryNudge',
        (stored) => ({ ...(stored ?? {}), ...patch }) as Stored,
      );
      setConfig(resolveSedentaryConfig(next));
      // 15 minutes while the nudge is on, 6 hours otherwise.
      await refreshBackgroundSchedule().catch(() => undefined);
      return true;
    } catch {
      setNotice('saveFailed');
      return false;
    }
  }, []);

  const update = useCallback(
    async (patch: Partial<SedentaryConfig>) => {
      setNotice(null);
      await save(patch);
    },
    [save],
  );

  /** On: asks Health Connect for what is missing first; off needs nothing. */
  const setEnabled = useCallback(
    async (enabled: boolean) => {
      setNotice(null);
      if (!enabled) {
        await save({ enabled: false });
        return;
      }
      const outcome = await ensureNudgePermissions(getHealthAdapter());
      if (outcome === 'cancelled') return;
      if (outcome !== 'granted') {
        setNotice(outcome === 'transient' ? 'requestFailed' : outcome);
        return;
      }
      await save({ enabled: true });
    },
    [save],
  );

  /**
   * Re-checks both permissions; turns the nudge off (and says why) only when both calls answered
   * and one of them is false. A failing call keeps the state as it is.
   */
  const recheck = useCallback(async () => {
    const stored = await getRepositories().settings.get('sedentaryNudge');
    if (!resolveSedentaryConfig(stored).enabled) return;
    if ((await nudgePermissionState(getHealthAdapter())) !== 'missing') return;
    await save({ enabled: false });
    setNotice('missingPermission');
  }, [save]);

  // The background job may have found the permission gone while the app was closed.
  useEffect(() => {
    let cancelled = false;
    const settings = getRepositories().settings;
    settings
      .get('sedentaryPermissionLost')
      .then(async (lost) => {
        // An unmounted screen must NOT consume the flag: the next mount still has to show it.
        if (!lost || cancelled) return;
        setConfig((current) => (current ? { ...current, enabled: false } : current));
        setNotice('missingPermission');
        // A failed removal would show the notice again on every mount: retry once, then log.
        await settings.remove('sedentaryPermissionLost').catch(async (error: unknown) => {
          if (__DEV__) console.warn('Could not clear the permission-lost flag, retrying', error);
          await settings.remove('sedentaryPermissionLost').catch((retry: unknown) => {
            if (__DEV__) console.warn('Could not clear the permission-lost flag', retry);
          });
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Every return to the app: permissions can be revoked from the system settings at any time.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recheck().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [recheck]);

  /** Opens Health Connect; the permissions are checked again when the app becomes active. */
  const openHealthSettings = useCallback(() => {
    getHealthAdapter().openSettings();
  }, []);

  return { config, notice, update, setEnabled, openHealthSettings };
}

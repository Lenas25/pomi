import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getRepositories } from '../db';
import type { SettingsValue } from '../db/repositories/settings';
import type { SedentaryConfig } from '../domain/sedentary';
import { getHealthAdapter } from '../health';
import { refreshBackgroundSchedule } from '../notifications/backgroundTasks';

import { ensureNudgePermissions } from './enable';
import { resolveSedentaryConfig } from './runNudge';

type Stored = SettingsValue<'sedentaryNudge'>;

export type SedentaryNotice =
  | 'unavailable'
  | 'denied'
  | 'bgDenied'
  | 'featureUnavailable'
  | 'missingPermission'
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
      const stored: Stored = (await settings.get('sedentaryNudge')) ?? {};
      const next = { ...stored, ...patch } as Stored;
      await settings.set('sedentaryNudge', next);
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
      if (outcome !== 'granted') {
        setNotice(outcome);
        return;
      }
      await save({ enabled: true });
    },
    [save],
  );

  const awaitingReturn = useRef(false);

  /** Re-checks both permissions; if one is gone while the nudge is on, turns it off and says why. */
  const recheck = useCallback(async () => {
    const stored = await getRepositories().settings.get('sedentaryNudge');
    if (!resolveSedentaryConfig(stored).enabled) return;
    const adapter = getHealthAdapter();
    const ok = await Promise.all([adapter.hasPermission(), adapter.hasBackgroundPermission()])
      .then(([steps, background]) => steps && background)
      .catch(() => false);
    if (ok) return;
    await save({ enabled: false });
    setNotice('missingPermission');
  }, [save]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && awaitingReturn.current) {
        awaitingReturn.current = false;
        void recheck();
      }
    });
    return () => subscription.remove();
  }, [recheck]);

  /** Opens Health Connect; when the person comes back the permissions are checked again. */
  const openHealthSettings = useCallback(() => {
    awaitingReturn.current = true;
    getHealthAdapter().openSettings();
  }, []);

  return { config, notice, update, setEnabled, openHealthSettings };
}

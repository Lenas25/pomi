import { useCallback, useEffect, useState } from 'react';

import { getRepositories } from '../db';
import type { Repositories } from '../db/repositories';
import type { SettingsValue } from '../db/repositories/settings';
import { resolveAnchors } from '../domain/agenda/buildAgenda';

import { requestNotificationSync } from './sync';

export type NotificationPrefs = SettingsValue<'notificationPrefs'>;

/** A change: either a patch, or a function of the CURRENT stored prefs that returns one. */
export type PrefsChange =
  Partial<NotificationPrefs> | ((current: NotificationPrefs) => Partial<NotificationPrefs>);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const withoutUndefined = (entries: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));

/**
 * Merges a patch, one level deep: a category object (`gym: { minutesBefore }`) is merged into the
 * stored category, so editing one field never drops its siblings. Arrays (quiet windows) and plain
 * values replace. An `undefined` value removes the key (back to the default behaviour), and a
 * category left empty is removed too.
 */
export function mergeNotificationPrefs(
  current: NotificationPrefs,
  patch: Partial<NotificationPrefs>,
): NotificationPrefs {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const stored: unknown = merged[key];
    if (isPlainObject(value) && isPlainObject(stored)) {
      const next = withoutUndefined({ ...stored, ...value });
      merged[key] = Object.keys(next).length > 0 ? next : undefined;
    } else if (isPlainObject(value)) {
      const next = withoutUndefined(value);
      merged[key] = Object.keys(next).length > 0 ? next : undefined;
    } else {
      merged[key] = value;
    }
  }
  return withoutUndefined(merged) as NotificationPrefs;
}

/**
 * Applies a change inside the settings mutex (read-modify-write of the stored value), so quick
 * consecutive edits never overwrite each other. Returns the saved prefs.
 */
export function savePrefsChange(
  settings: Repositories['settings'],
  change: PrefsChange,
): Promise<NotificationPrefs> {
  return settings.update('notificationPrefs', (stored) => {
    const current = stored ?? {};
    return mergeNotificationPrefs(current, typeof change === 'function' ? change(current) : change);
  });
}

type LoadState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; prefs: NotificationPrefs; bedMin: number | undefined };

/** Reads the notification preferences; every change is saved and refills the scheduled window. */
export function useNotificationPrefs() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const settings = getRepositories().settings;
    Promise.all([
      settings.get('notificationPrefs'),
      settings.get('anchors'),
      settings.get('planShifts'),
    ])
      .then(([stored, anchors, shifts]) => {
        if (cancelled) return;
        const bedMin = resolveAnchors(anchors ?? {}, shifts ?? {}).bed;
        setState({ status: 'ready', prefs: stored ?? {}, bedMin });
      })
      .catch(() => {
        // Never show the defaults as if they were the person's choices: say it and offer a retry.
        if (!cancelled) setState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  const update = useCallback(async (change: PrefsChange) => {
    try {
      const saved = await savePrefsChange(getRepositories().settings, change);
      setState((previous) =>
        previous.status === 'ready' ? { ...previous, prefs: saved } : previous,
      );
      setFailed(false);
      void requestNotificationSync('settingsChanged');
    } catch {
      setFailed(true);
    }
  }, []);

  return {
    prefs: state.status === 'ready' ? state.prefs : null,
    bedMin: state.status === 'ready' ? state.bedMin : undefined,
    loadFailed: state.status === 'failed',
    retry,
    update,
    failed,
  };
}

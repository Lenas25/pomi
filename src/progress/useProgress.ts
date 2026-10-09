// Glue between the Progress tab and the repositories. The numbers come from `progressView.ts`.
import { useCallback, useRef, useState } from 'react';

import { getRepositories } from '../db';
import { dayKeyFor } from '../domain/time';
import { useLocaleStore } from '../i18n';

import {
  ALL_PROGRESS_EXTRAS,
  loadProgressData,
  type ProgressData,
  type ProgressExtra,
} from './loadProgress';

export type ProgressState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ProgressData };

/** `extras`: the computed parts to read (detail pages read only theirs; default all). */
export function useProgress(extras: readonly ProgressExtra[] = ALL_PROGRESS_EXTRAS) {
  const [state, setState] = useState<ProgressState>({ status: 'loading' });
  // Drops the result of a load that finished after a newer one started.
  const generation = useRef(0);
  // Template texts (measurement names, pose labels, guide) are resolved at load time: a language
  // change gives a new `load`, which the screen's focus effect runs again.
  const language = useLocaleStore((store) => store.language);
  // A stable key, so a new array with the same parts does not give a new `load`.
  const extrasKey = extras.join(',');

  const load = useCallback(async (): Promise<void> => {
    const ticket = (generation.current += 1);
    try {
      const parts = extrasKey === '' ? [] : (extrasKey.split(',') as ProgressExtra[]);
      const data = await loadProgressData(getRepositories(), dayKeyFor(new Date()), parts);
      if (ticket === generation.current) setState({ status: 'ready', data });
    } catch (error) {
      if (__DEV__) console.error('Could not load the progress', error);
      if (ticket === generation.current) setState({ status: 'error' });
    }
    // `language` is not read here, but the loaded texts depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, extrasKey]);

  /** Saves today's value of a measurement (one per day: a second save replaces the first). */
  const saveMetric = useCallback(
    async (metricId: string, value: number): Promise<void> => {
      await getRepositories().metrics.upsert(metricId, dayKeyFor(new Date()), value);
      await load();
    },
    [load],
  );

  return { state, load, saveMetric };
}

// Glue between the Progress tab and the repositories. The numbers come from `progressView.ts`.
import { useCallback, useRef, useState } from 'react';

import { getRepositories } from '../db';
import { dayKeyFor } from '../domain/time';

import { loadProgressData, type ProgressData } from './loadProgress';

export type ProgressState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ProgressData };

export function useProgress() {
  const [state, setState] = useState<ProgressState>({ status: 'loading' });
  // Drops the result of a load that finished after a newer one started.
  const generation = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const ticket = (generation.current += 1);
    try {
      const data = await loadProgressData(getRepositories(), dayKeyFor(new Date()));
      if (ticket === generation.current) setState({ status: 'ready', data });
    } catch (error) {
      if (__DEV__) console.error('Could not load the progress', error);
      if (ticket === generation.current) setState({ status: 'error' });
    }
  }, []);

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

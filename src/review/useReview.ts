// Glue between the weekly review screen and the repositories.
import { useCallback, useEffect, useState } from 'react';

import { getRepositories } from '../db';
import { dayKeyFor } from '../domain/time';
import { requestNotificationSync } from '../notifications/sync';
import { useSuggestionActions } from '../suggestions/useSuggestionActions';
import type { GymPlan } from '../templates/schema';

import { loadReview, type ReviewScreenData } from './loadReview';
import { saveWeekPlan } from './weekPlan';

export type ReviewLoad =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ReviewScreenData };

export function useReview() {
  const [load, setLoad] = useState<ReviewLoad>({ status: 'loading' });

  const reload = useCallback(async (): Promise<void> => {
    try {
      setLoad({ status: 'ready', data: await loadReview(getRepositories(), new Date()) });
    } catch (error) {
      if (__DEV__) console.error('Could not load the weekly review', error);
      setLoad({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadReview(getRepositories(), new Date()).then(
      (data) => {
        if (!cancelled) setLoad({ status: 'ready', data });
      },
      (error: unknown) => {
        if (__DEV__) console.error('Could not load the weekly review', error);
        if (!cancelled) setLoad({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  /** "Planifica tu semana": stores the week override, then reschedules the reminders right away. */
  const saveWeek = useCallback(
    async (plan: GymPlan | null): Promise<void> => {
      // The card only renders once loaded; a call before that is a bug, so it must surface.
      if (load.status !== 'ready') throw new Error('The weekly review is not loaded yet');
      await saveWeekPlan(
        getRepositories(),
        load.data.weekPlan.weekStart,
        plan,
        dayKeyFor(new Date()),
      );
      void requestNotificationSync('settingsChanged');
    },
    [load],
  );

  return { load, reload, saveWeek, suggestions: useSuggestionActions(reload) };
}

// Glue between the weekly review screen and the repositories.
import { useCallback, useEffect, useState } from 'react';

import { getRepositories } from '../db';
import { useSuggestionActions } from '../suggestions/useSuggestionActions';

import { loadReview, type ReviewScreenData } from './loadReview';

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

  return { load, reload, suggestions: useSuggestionActions(reload) };
}

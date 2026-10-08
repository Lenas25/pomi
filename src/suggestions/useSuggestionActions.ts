// React glue for "Aceptar" / "Ahora no", shared by Hoy and the weekly review. The decisions live in
// `run.ts` (tested); this hook only adds the busy flag, the feedback toast and the reschedule.
import { useState } from 'react';

import { getDatabase, getRepositories } from '../db';
import { useT } from '../i18n';
import { requestNotificationSync } from '../notifications/sync';

import { acceptSuggestion, rejectSuggestion } from './run';

/** Feedback after accepting a suggestion (an info or error toast). */
export type SuggestionNotice = {
  id: number;
  variant: 'info' | 'error';
  title: string;
  subtitle: string;
};

/** `onChanged` reloads the screen's data once a suggestion was decided. */
export function useSuggestionActions(onChanged: () => Promise<void>) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<SuggestionNotice | null>(null);

  const failure = (): SuggestionNotice => ({
    id: Date.now(),
    variant: 'error',
    title: t('suggestions.card.failedTitle'),
    subtitle: t('suggestions.card.failed'),
  });

  const accept = async (id: number): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await acceptSuggestion(getDatabase(), getRepositories(), id);
      if (result.status === 'applied') {
        // The plan changed: reminders must follow (bedtime, water, gym day...).
        void requestNotificationSync('suggestionAccepted');
        setNotice({
          id: Date.now(),
          variant: 'info',
          title: t('suggestions.card.acceptedTitle'),
          subtitle: t('suggestions.card.accepted'),
        });
      } else {
        setNotice(failure());
      }
    } catch (error) {
      if (__DEV__) console.error('Could not accept the suggestion', error);
      setNotice(failure());
    } finally {
      setBusy(false);
      await onChanged();
    }
  };

  const decline = async (id: number): Promise<void> => {
    try {
      await rejectSuggestion(getRepositories(), id);
    } catch (error) {
      if (__DEV__) console.error('Could not reject the suggestion', error);
    } finally {
      await onChanged();
    }
  };

  return { busy, notice, clearNotice: () => setNotice(null), accept, decline };
}

// "Vista previa de mañana" in Mis avisos: the planner's real output for tomorrow, re-read after
// every preference change.
import { format } from 'date-fns';
import { useEffect, useState } from 'react';

import { getRepositories } from '../db';
import type { Repositories } from '../db/repositories';
import type { PlannedNotification } from '../domain/notifications/buildUpcoming';
import { previewTomorrow } from '../domain/notifications/preview';
import { dayKeyFor } from '../domain/time';
import type { Translate } from '../i18n';

import { loadNotificationPlan } from './loadState';
import { resolveText } from './resolve';

export type PreviewRow = { id: string; time: string; title: string };

export type TomorrowPreview =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'off' }
  | { status: 'ready'; planned: PlannedNotification[] };

/** Loads the plan from the repositories and returns tomorrow's notifications (or `off`). */
export async function loadTomorrowPreview(
  repos: Repositories,
  now: Date,
): Promise<Exclude<TomorrowPreview, { status: 'loading' } | { status: 'error' }>> {
  const plan = await loadNotificationPlan(repos, dayKeyFor(now));
  if (!plan.enabled) return { status: 'off' };
  return { status: 'ready', planned: previewTomorrow(plan.state, now) };
}

/** One line per notification: exact local time and the resolved title. */
export function previewRows(planned: readonly PlannedNotification[], t: Translate): PreviewRow[] {
  return planned.map((item) => ({
    id: item.id,
    time: format(item.at, 'HH:mm'),
    title: resolveText(item.text, t).title,
  }));
}

/** `version` changes whenever the preferences were saved, so the preview follows them. */
export function useTomorrowPreview(version: unknown): TomorrowPreview {
  const [preview, setPreview] = useState<TomorrowPreview>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    loadTomorrowPreview(getRepositories(), new Date())
      .then((next) => {
        if (!cancelled) setPreview(next);
      })
      .catch(() => {
        if (!cancelled) setPreview({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);
  return preview;
}

import { minutesToClock } from '../domain/time';
import type { TimelineEntry } from '../domain/today/timeline';
import type { Language, Translate } from '../i18n';
import { localizeTargetParams } from '../gym/sessionViewModel';

import type { GymGoal } from './gymGoal';
import { waterProgress, type LiveFacts } from './todayView';

export function entryTitle(entry: TimelineEntry, t: Translate): string {
  return entry.label.type === 'key' ? t(entry.label.key) : entry.label.text;
}

export function entryTime(entry: TimelineEntry): string | null {
  return entry.minutes === null ? null : minutesToClock(entry.minutes);
}

/** The line under the title: today's routine on the gym row, "x de y vasos" on the water row. */
export function entrySubtitle(
  entry: TimelineEntry,
  context: { routineName: string | undefined; facts: LiveFacts },
  t: Translate,
): string | undefined {
  if (entry.kind === 'gym') return context.routineName;
  if (entry.kind === 'water') {
    const progress = waterProgress(context.facts.view);
    return progress ? t('today.sub.water', progress) : undefined;
  }
  return undefined;
}

/** What a screen reader says for the whole row. */
export function entryAccessibilityLabel(entry: TimelineEntry, t: Translate): string {
  return t('today.itemLabel', {
    time: entryTime(entry) ?? t('today.allDayLabel'),
    title: entryTitle(entry, t),
    status: t(`today.status.${entry.status}`),
  });
}

/**
 * The highlighted "meta de hoy" under the gym row (energy color): the first main exercise and its
 * target. Hidden once the session is done, and when there is no target to show.
 */
export function entryHighlight(
  entry: TimelineEntry,
  context: { gymGoal: GymGoal | undefined },
  t: Translate,
  language: Language,
): string | undefined {
  if (entry.kind !== 'gym' || entry.status === 'done' || !context.gymGoal) return undefined;
  const { exercise, message } = context.gymGoal;
  return t('today.sub.goal', {
    exercise,
    goal: t(message.key, localizeTargetParams(message.params, language)),
  });
}

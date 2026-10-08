import { BODY_MAX, clampText, TITLE_MAX } from '../domain/notifications/buildUpcoming';
import { minutesToClock } from '../domain/time';
import type { TimelineEntry } from '../domain/today/timeline';
import type { Language, Translate } from '../i18n';
import { localizeTargetParams } from '../gym/sessionViewModel';

import type { GymGoal } from './gymGoal';
import { waterProgress, type LiveFacts } from './todayView';

/** The "Hora de dormir" reminder row (template `sueno` / `dormir`): it opens the bedtime calculator. */
export const BEDTIME_ENTRY_ID = 'reminder:sueno:dormir';

export function isBedtimeEntry(entry: TimelineEntry): boolean {
  return entry.id === BEDTIME_ENTRY_ID;
}

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

/** Title and body of the reminder that brings a postponed row back, by kind of row (BRAND §9 limits). */
export function snoozeContent(entry: TimelineEntry, t: Translate): { title: string; body: string } {
  switch (entry.kind) {
    case 'gym':
      return { title: t('notify.gym.title'), body: t('notify.gym.body') };
    case 'checkin': {
      const key = entry.id === 'checkin:morning' ? 'notify.checkinMorning' : 'notify.checkinNight';
      return { title: t(`${key}.title`), body: t(`${key}.body`) };
    }
    case 'reminder':
      return {
        title: t('notify.reminder.title'),
        body: clampText(entryTitle(entry, t), BODY_MAX),
      };
    default:
      return {
        title: clampText(entryTitle(entry, t), TITLE_MAX),
        body: t('notify.habit.body'),
      };
  }
}

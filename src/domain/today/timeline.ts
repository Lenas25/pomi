// The Hoy timeline: the agenda of the day mapped to what the person sees (HANDOFF §4 TimelineItem)
// with LIVE progress. Pure: `nowMinutes` and the progress come in as arguments.
import type { AgendaItem, AgendaKind, AgendaLabel } from '../agenda/buildAgenda';

export type TimelineStatus = 'upcoming' | 'now' | 'done' | 'skipped';

/** What is already true today, by agenda item id. */
export type DayProgress = {
  /** Gym session finished, check-in saved, water goal met, check logged, steps goal reached... */
  doneIds: ReadonlySet<string>;
  /** Items the person acknowledged by hand (reminders) or marked done from the timeline. */
  ackedIds: ReadonlySet<string>;
  /** "Omitir hoy". */
  skippedIds: ReadonlySet<string>;
  /** "Posponer 10 min": item id -> minute of the day it is postponed to. */
  snoozedTo: ReadonlyMap<string, number>;
};

export const NOW_WINDOW_MIN = 45;

export type TimelineEntry = {
  id: string;
  kind: AgendaKind;
  label: AgendaLabel;
  /** Minute of the day shown, `null` for all-day items. */
  minutes: number | null;
  status: TimelineStatus;
  /** The agenda item, for the actions and the navigation. */
  item: AgendaItem;
};

/**
 * The occurrence to show: a postponed time wins; otherwise the one in effect (started less than
 * `NOW_WINDOW_MIN` ago), else the next one, else the last one of the day.
 */
export function shownMinute(
  item: AgendaItem,
  nowMinutes: number,
  snoozedTo?: number,
): number | null {
  if (snoozedTo !== undefined && snoozedTo > nowMinutes) return snoozedTo;
  if (item.occurrences.length === 0) return item.minutes;
  const inEffect = item.occurrences.filter(
    (minute) => minute <= nowMinutes && nowMinutes < minute + NOW_WINDOW_MIN,
  );
  if (inEffect.length > 0) return inEffect[inEffect.length - 1] ?? null;
  const next = item.occurrences.find((minute) => minute > nowMinutes);
  return next ?? item.occurrences[item.occurrences.length - 1] ?? null;
}

export function statusOf(
  item: AgendaItem,
  nowMinutes: number,
  progress: DayProgress,
): TimelineStatus {
  if (progress.doneIds.has(item.id) || progress.ackedIds.has(item.id)) return 'done';
  if (progress.skippedIds.has(item.id)) return 'skipped';
  const snoozed = progress.snoozedTo.get(item.id);
  if (snoozed !== undefined && snoozed > nowMinutes) return 'upcoming';
  const live = item.occurrences.some(
    (minute) => minute <= nowMinutes && nowMinutes < minute + NOW_WINDOW_MIN,
  );
  // Past and not done is simply "upcoming": nothing is ever marked as missed.
  return live ? 'now' : 'upcoming';
}

export function buildTimeline(
  agenda: readonly AgendaItem[],
  nowMinutes: number,
  progress: DayProgress,
): TimelineEntry[] {
  return agenda.map((item) => ({
    id: item.id,
    kind: item.kind,
    label: item.label,
    minutes: shownMinute(item, nowMinutes, progress.snoozedTo.get(item.id)),
    status: statusOf(item, nowMinutes, progress),
    item,
  }));
}

/**
 * Rows the person can actually complete: gym and check-ins; water only with a daily target
 * (without a weight there is nothing to reach); habits only when they are checks (a counter that
 * is not water has no "done" meaning). Steps are automatic and reminders informative.
 */
export function isRequired(entry: TimelineEntry): boolean {
  switch (entry.kind) {
    case 'gym':
    case 'checkin':
      return true;
    case 'water':
      return entry.item.target?.glasses !== undefined;
    case 'habit':
      return entry.item.habitType === 'check';
    case 'steps':
    case 'reminder':
      return false;
  }
}

/**
 * "Listo por hoy": every required entry is done or skipped. An empty day is not "done" (there is
 * nothing to rest from), and an unanswered "¿Te moviste hoy?" does not block it.
 */
export function isAllDone(entries: readonly TimelineEntry[]): boolean {
  const required = entries.filter(isRequired);
  return (
    required.length > 0 && required.every((e) => e.status === 'done' || e.status === 'skipped')
  );
}

// --- What a swipe / press does ----------------------------------------------------------------

export type EntryAction =
  | { type: 'logCheck'; habitId: string }
  | { type: 'addWater'; habitId: string }
  | { type: 'acknowledge' }
  | { type: 'open'; target: 'gym' | 'habits' | `checkin:${'morning' | 'night'}` };

/** Swipe right / the check button. Things that need real input open their screen instead. */
export function doneActionFor(entry: TimelineEntry): EntryAction {
  const { item } = entry;
  switch (entry.kind) {
    case 'habit':
      if (item.habitType === 'counter') return { type: 'open', target: 'habits' };
      return item.habitId ? { type: 'logCheck', habitId: item.habitId } : { type: 'acknowledge' };
    case 'water':
      return item.habitId
        ? { type: 'addWater', habitId: item.habitId }
        : { type: 'open', target: 'habits' };
    case 'reminder':
      return { type: 'acknowledge' };
    case 'gym':
      return { type: 'open', target: 'gym' };
    case 'checkin':
      return {
        type: 'open',
        target: item.id === 'checkin:morning' ? 'checkin:morning' : 'checkin:night',
      };
    case 'steps':
      return { type: 'open', target: 'habits' };
  }
}

/** A horizontal drag counts as "swipe right = done" past this distance, mostly horizontal. */
export const SWIPE_DONE_DISTANCE = 96;

export function isSwipeDone(dx: number, dy: number): boolean {
  return dx >= SWIPE_DONE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 2;
}

export const SNOOZE_MINUTES = 10;

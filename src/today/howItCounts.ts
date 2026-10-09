// "Cómo se cuenta": one line per task saying how it gets done and when its reminders ring
// ("Márcala tú · avisos 09:00–18:00 · Lun–Vie"). Pure over the agenda item and its week.
import type { AgendaItem } from '../domain/agenda/buildAgenda';
import type { WeeklyItem } from '../domain/agenda/weekly';
import { minutesToClock } from '../domain/time';
import type { Translate } from '../i18n';

const SHORT_DAY = [
  'weekdays.short.d0',
  'weekdays.short.d1',
  'weekdays.short.d2',
  'weekdays.short.d3',
  'weekdays.short.d4',
  'weekdays.short.d5',
  'weekdays.short.d6',
] as const;

/** Monday-first position of a weekday (0 = Sunday goes last). */
const mondayFirst = (day: number) => (day + 6) % 7;

/** How the task is completed. */
export function countRule(
  item: Pick<AgendaItem, 'kind' | 'habitType' | 'target'>,
  t: Translate,
): string {
  switch (item.kind) {
    case 'gym':
      return t('today.how.gym');
    case 'checkin':
      return t('today.how.checkin');
    case 'reminder':
      return t('today.how.reminder');
    case 'water':
      return item.target?.glasses !== undefined
        ? t('today.how.waterWeight', { count: item.target.glasses })
        : t('today.how.water');
    case 'steps':
      return item.target?.steps !== undefined
        ? t('today.how.steps', { count: item.target.steps })
        : t('today.how.stepsNoGoal');
    case 'habit':
      return item.habitType === 'counter' ? t('today.how.counter') : t('today.how.check');
  }
}

/** "Todos los días", a Monday-first run ("Lun–Vie") or a list ("Lun, Mié, Vie"). */
export function daysLabel(days: readonly number[], t: Translate): string {
  const unique = [...new Set(days)].sort((a, b) => mondayFirst(a) - mondayFirst(b));
  if (unique.length === 7) return t('today.how.everyDay');
  const names = unique.map((day) => t(SHORT_DAY[day] ?? SHORT_DAY[0]));
  const first = unique[0];
  const last = unique[unique.length - 1];
  const contiguous =
    first !== undefined &&
    last !== undefined &&
    mondayFirst(last) - mondayFirst(first) === unique.length - 1;
  if (unique.length >= 3 && contiguous) return `${names[0]}–${names[names.length - 1]}`;
  return names.join(', ');
}

/** When its reminders ring: "aviso 13:30 · Lun–Vie" / "avisos 09:00–18:00 · todos los días". */
export function scheduleLine(week: Pick<WeeklyItem, 'days' | 'occurrences'>, t: Translate): string {
  const times = week.occurrences;
  const first = times[0];
  const last = times[times.length - 1];
  if (first === undefined || last === undefined) return daysLabel(week.days, t);
  const when =
    times.length === 1
      ? t('today.how.timesOne', { time: minutesToClock(first) })
      : t('today.how.timesRange', { from: minutesToClock(first), until: minutesToClock(last) });
  return `${when} · ${daysLabel(week.days, t)}`;
}

/** The whole line: the rule, then the schedule when there is one. */
export function howItCountsLine(week: WeeklyItem, t: Translate): string {
  return `${countRule(week.item, t)} · ${scheduleLine(week, t)}`;
}

// The week of every agenda item: on which weekdays it shows and at what times. Pure: it builds the
// same agenda as Hoy (and the notifications) for the 7 days starting at `date`.
import { addDays, getDay } from 'date-fns';

import { buildAgenda, type AgendaItem, type AgendaState } from './buildAgenda';

export type WeeklyItem = {
  /** Weekdays (0 = Sunday) the item is part of the day, ascending. */
  days: number[];
  /** Its times on `date` when it shows that day, else on the next day it shows. */
  occurrences: number[];
  /** The item itself (that same day), for its kind, habit type and target. */
  item: AgendaItem;
};

/** Every item that shows on at least one of the 7 days from `date`, keyed by its id. */
export function weeklyItems(date: Date, state: AgendaState): Record<string, WeeklyItem> {
  const result: Record<string, WeeklyItem> = {};
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(date, offset);
    const weekday = getDay(day);
    for (const item of buildAgenda(day, state)) {
      const known = result[item.id];
      if (known) {
        known.days.push(weekday);
      } else {
        result[item.id] = { days: [weekday], occurrences: item.occurrences, item };
      }
    }
  }
  for (const entry of Object.values(result)) entry.days.sort((a, b) => a - b);
  return result;
}

// "Vista previa de mañana" in Mis avisos: exactly what the planner schedules for tomorrow. Pure.
import { addDays, format } from 'date-fns';

import { dayStartFor } from '../time';
import { buildUpcoming, type PlannedNotification, type UpcomingState } from './buildUpcoming';

/**
 * Tomorrow's notifications (the logical day after `now`), in time order. The REAL window is built
 * from `now` (today's done flags and the 64-cap ordering included, as the scheduler does) and only
 * then filtered to tomorrow, so every row is a notification that is actually scheduled.
 */
export function previewTomorrow(state: UpcomingState, now: Date): PlannedNotification[] {
  const tomorrow = format(addDays(dayStartFor(now), 1), 'yyyy-MM-dd');
  return buildUpcoming(state, now).filter((planned) => planned.data.date === tomorrow);
}

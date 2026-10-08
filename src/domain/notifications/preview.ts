// "Vista previa de mañana" in Mis avisos: exactly what the planner would send tomorrow. Pure.
import { addDays, format } from 'date-fns';

import { dayKeyFor, dayStartFor } from '../time';
import { buildUpcoming, type PlannedNotification, type UpcomingState } from './buildUpcoming';

/**
 * Tomorrow's notifications (the logical day after `now`), in time order. Today's "already done"
 * flags never affect tomorrow, so they are cleared; the window starts just before tomorrow's
 * midnight and keeps only what belongs to tomorrow's logical day (00:00-03:59 the day after too).
 */
export function previewTomorrow(state: UpcomingState, now: Date): PlannedNotification[] {
  const tomorrowStart = addDays(dayStartFor(now), 1);
  const tomorrow = format(tomorrowStart, 'yyyy-MM-dd');
  const from = new Date(tomorrowStart.getTime() - 1);
  const clean: UpcomingState = {
    ...state,
    today: {
      activityLogged: false,
      gymDone: false,
      checkinsDone: { morning: false, night: false },
      doneAgendaIds: [],
      monthlyDone: false,
    },
  };
  return buildUpcoming(clean, from, 2).filter(
    (planned) => dayKeyFor(new Date(planned.at)) === tomorrow,
  );
}

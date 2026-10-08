// Everything the Hoy screen needs, read in one pass (all local, near instant).
import { format, getDay, subDays } from 'date-fns';

import type { Repositories } from '../db/repositories';
import { buildAgenda, type AgendaItem } from '../domain/agenda/buildAgenda';
import { todaysRoutineId } from '../domain/gym/rotation';
import { dayKeyFor, dayStartFor } from '../domain/time';
import type { ActivityKind } from '../domain/habits/activity';
import type { IdentityInput } from '../domain/today/identity';
import { pickProgram, toRotationSessions } from '../gym/program';
import { loadGymGoal, type GymGoal } from './gymGoal';
import { loadHabitsData } from '../habits/habitsData';
import { buildHabitsView } from '../habits/habitsView';

import { todayStateFor, type LiveFacts, type TodayState } from './todayView';

const IDENTITY_LOOKBACK_DAYS = 56;
const ROTATION_LOOKBACK = 40;

export type TodayData = {
  today: string;
  /** Local midnight that opens the logical day (the origin of the agenda minutes). */
  midnight: Date;
  userName: string | undefined;
  agenda: AgendaItem[];
  facts: LiveFacts;
  state: TodayState;
  activityToday: ActivityKind | undefined;
  /** Name of today's routine, shown under the gym row. */
  routineName: string | undefined;
  /** Target of the first main exercise of today's routine (the gym row highlight). */
  gymGoal: GymGoal | undefined;
  identity: Omit<IdentityInput, 'today'>;
};

export async function loadTodayData(repos: Repositories, now: Date): Promise<TodayData> {
  const today = dayKeyFor(now);
  const midnight = dayStartFor(now);
  const lookbackFrom = format(subDays(midnight, IDENTITY_LOOKBACK_DAYS), 'yyyy-MM-dd');

  const [habits, anchors, userName, stored, modules, sessions, recent] = await Promise.all([
    loadHabitsData(repos, today),
    repos.settings.get('anchors'),
    repos.settings.get('userName'),
    repos.settings.get('todayState'),
    repos.templates.listModules(),
    repos.workouts.sessionsInRange(lookbackFrom, today),
    repos.workouts.recentSessions(ROTATION_LOOKBACK),
  ]);
  const view = buildHabitsView(habits, today);

  const finished = sessions.filter(
    (entry) => entry.session.finishedAt !== null && entry.sets.length > 0,
  );
  const gymDates = [...new Set(finished.map((entry) => entry.session.date))];

  const program = pickProgram(modules);
  const routineId = program
    ? todaysRoutineId(
        program.routines.map((routine) => routine.id),
        toRotationSessions(recent),
        today,
      )
    : null;
  const routine = program?.routines.find((candidate) => candidate.id === routineId);

  const agenda = buildAgenda(midnight, {
    profile: { weightKg: habits.profile.weightKg, workType: habits.profile.workType },
    anchors: anchors ?? {},
    gymDays: habits.gymDays,
    checkinPrefs: habits.checkinPrefs,
    modules: habits.modules.filter((module) => module.active).map((module) => module.template),
    ...(routine ? { todayRoutine: { id: routine.id, steps: routine.steps } } : {}),
    ...(view.steps?.plan.goal != null ? { stepsGoal: view.steps.plan.goal } : {}),
  });

  const gymGoal = program
    ? await loadGymGoal(repos, routine, program.rules, getDay(midnight))
    : undefined;

  return {
    today,
    midnight,
    userName,
    agenda,
    facts: { gymDone: gymDates.includes(today), view },
    state: todayStateFor(stored, today),
    activityToday: view.activityToday,
    routineName: routine?.name,
    gymGoal,
    identity: {
      gymDates,
      plannedGymDays: new Set(habits.gymDays.flatMap((entry) => entry.days)).size,
      waterDays: view.water?.consistency?.done ?? null,
      firstDay: habits.startedOn === today,
    },
  };
}

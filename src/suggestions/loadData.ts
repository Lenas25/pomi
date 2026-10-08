// Reads everything `buildSuggestions` needs from the repositories (all local, near instant).
import { format, parseISO, subDays } from 'date-fns';

import type { Repositories } from '../db/repositories';
import type { SuggestionRow } from '../db/repositories/suggestions';
import { toMorningCheckin } from '../domain/habits/checkins';
import { stepsPlan } from '../domain/habits/stepsPlan';
import { waterTargetFor } from '../domain/habits/waterTarget';
import { dayKeyFor } from '../domain/time';
import { targetOfChange } from '../domain/suggestions/availability';
import {
  SUGGESTION_KINDS,
  type LiftHistory,
  type SuggestionData,
  type SuggestionHistoryEntry,
  type SuggestionKind,
  type WaterDay,
} from '../domain/suggestions/types';
import { resolveAnchors } from '../domain/agenda/buildAgenda';
import { WATER_CURVE_WINDOW_DAYS, waterCurve } from '../domain/companion';
import { valueAt } from '../domain/suggestions/waterAt';
import { WATER_HOUR, WATER_WINDOW_DAYS } from '../domain/suggestions/limits';
import { activeDeloadPct } from '../gym/deload';
import { pickProgram } from '../gym/program';
import { toExerciseSession } from '../gym/sessionViewModel';
import type { ModuleTemplate } from '../templates/schema';

import { parsePayload } from './payload';
import { templateText } from '../i18n/templateText';

const SLEEP_LOOKBACK_DAYS = 14;
const STEPS_LOOKBACK_DAYS = 15;
const GYM_LOOKBACK_DAYS = 29;

const isKind = (value: string): value is SuggestionKind =>
  (SUGGESTION_KINDS as readonly string[]).includes(value);

/** What the stored change is about (see `targetOfChange`); `null` for an unreadable payload. */
function targetOf(row: SuggestionRow): string | null {
  const payload = parsePayload(row.payload);
  return payload ? targetOfChange(payload.change) : null;
}

/** Rows -> the engine's history (day keys). Rows of an unknown kind are ignored. */
export function toHistory(rows: readonly SuggestionRow[]): SuggestionHistoryEntry[] {
  return rows.flatMap((row) =>
    isKind(row.kind)
      ? [
          {
            kind: row.kind,
            target: targetOf(row),
            status: row.status,
            createdOn: dayKeyFor(new Date(row.createdAt)),
            decidedOn: row.decidedAt === null ? null : dayKeyFor(new Date(row.decidedAt)),
          },
        ]
      : [],
  );
}

/** The first active counter whose target is the water formula. */
export function waterHabit(modules: readonly { active: boolean; template: ModuleTemplate }[]) {
  for (const { active, template } of modules) {
    if (!active) continue;
    for (const habit of template.habits ?? []) {
      if (
        habit.type === 'counter' &&
        typeof habit.target === 'object' &&
        habit.target.formula === 'water'
      ) {
        return habit;
      }
    }
  }
  return undefined;
}

export async function loadSuggestionData(
  repos: Repositories,
  today: string,
): Promise<SuggestionData> {
  const base = parseISO(today);
  const key = (offset: number) => format(subDays(base, offset), 'yyyy-MM-dd');

  const [
    modules,
    profile,
    anchors,
    shifts,
    gymDays,
    goals,
    startedOn,
    stepsEstimate,
    deloadWeek,
    suggestions,
    gymPlanChangedOn,
    goalsChangedOn,
    gymWeekPlans,
    gymPlan,
  ] = await Promise.all([
    repos.templates.listModules(),
    repos.profile.get(),
    repos.settings.get('anchors'),
    repos.settings.get('planShifts'),
    repos.settings.get('gymDays'),
    repos.settings.get('goals'),
    repos.settings.get('startedOn'),
    repos.settings.get('stepsEstimate'),
    repos.settings.get('deloadWeek'),
    repos.suggestions.all(),
    repos.settings.get('gymDaysChangedOn'),
    repos.settings.get('goalsChangedOn'),
    repos.settings.get('gymWeekPlans'),
    repos.settings.get('gymPlan'),
  ]);
  const active = modules.filter((module) => module.active);

  // Sleep: the morning check-ins of the last two weeks.
  const morningQuestions = active.find((module) => module.template.checkins?.morning)?.template
    .checkins?.morning;
  const morningRows = morningQuestions
    ? await repos.checkins.inRange(key(SLEEP_LOOKBACK_DAYS - 1), today, 'morning')
    : [];
  const sleep = morningQuestions
    ? morningRows.flatMap((row) => toMorningCheckin(row.date, morningQuestions, row.answers) ?? [])
    : [];

  // Steps: from the start of the baseline week so the plan can fix its goal.
  const stepsFrom =
    startedOn !== undefined && startedOn < key(STEPS_LOOKBACK_DAYS)
      ? startedOn
      : key(STEPS_LOOKBACK_DAYS);
  const stepRows = await repos.steps.inRange(stepsFrom, today);
  const plan = stepsPlan({
    today,
    startedOn,
    history: stepRows,
    estimate: stepsEstimate,
    editedGoal: goals?.stepsGoal,
  });

  // Water: value at 18:00 of each of the last 7 finished days (only days with a write).
  const water: WaterDay[] = [];
  const habit = waterHabit(active);
  if (habit) {
    const events = await repos.habitLogs.eventsInRange(key(WATER_WINDOW_DAYS), key(1), habit.id);
    for (let offset = 1; offset <= WATER_WINDOW_DAYS; offset += 1) {
      const date = key(offset);
      const ofDay = events.filter((event) => event.date === date);
      const target = waterTargetFor(date, {
        weightKg: profile?.weightKg ?? undefined,
        gymDays: gymDays ?? [],
        gymPlan,
        gymWeekPlans,
        glassMl: habit.glassMl,
        goals: goals ?? {},
      });
      if (ofDay.length === 0 || target === null) continue;
      const limit = new Date(parseISO(date).getTime());
      limit.setHours(WATER_HOUR, 0, 0, 0);
      water.push({
        date,
        glassesAt18: valueAt(ofDay, limit.getTime()),
        targetGlasses: target.glasses,
      });
    }
  }

  // The afternoon gap of the water curve (PLAN §14b) only enriches the reason of that suggestion.
  let waterGap: SuggestionData['waterGap'];
  if (habit) {
    const events = (
      await repos.habitLogs.eventsInRange(key(WATER_CURVE_WINDOW_DAYS), key(1), habit.id)
    ).map(({ date, at, value }) => ({ date, at, value }));
    const resolved = resolveAnchors(anchors ?? {}, shifts ?? {});
    waterGap =
      waterCurve({ events, today, wakeMin: resolved.wake, bedMin: resolved.bed })?.gap ?? undefined;
  }

  // Gym: finished sessions with sets, plus "Fui al gym" answers.
  const from = key(GYM_LOOKBACK_DAYS);
  const [sessions, activity] = await Promise.all([
    repos.workouts.sessionsInRange(from, today),
    repos.activity.inRange(from, today),
  ]);
  const gymDates = [
    ...new Set([
      ...sessions
        .filter((entry) => entry.session.finishedAt !== null && entry.sets.length > 0)
        .map((entry) => entry.session.date),
      ...activity.filter((row) => row.kind === 'gym').map((row) => row.date),
    ]),
  ];

  // Lifts: every `sets` exercise of the program with its recent sessions.
  const program = pickProgram(modules);
  const rules = program?.rules ?? { stallSessions: 3, deloadPct: 10 };
  const seen = new Set<string>();
  const lifts: LiftHistory[] = [];
  for (const routine of program?.routines ?? []) {
    for (const step of routine.steps) {
      if (step.type !== 'sets' || seen.has(step.id)) continue;
      seen.add(step.id);
      const history = await repos.workouts.recentSessionsForStep(step.id, rules.stallSessions + 2);
      lifts.push({
        stepId: step.id,
        name: templateText(step.name),
        sessions: history.map(({ session, sets }) =>
          toExerciseSession({ date: session.date, sets }),
        ),
      });
    }
  }

  return {
    anchors: anchors ?? {},
    shifts: shifts ?? {},
    gymDays: gymDays ?? [],
    ...(gymWeekPlans ? { gymWeekPlans } : {}),
    startedOn,
    gymPlanChangedOn,
    goalsChangedOn,
    deloadEndedOn: deloadWeek?.endsOn,
    sleep,
    steps: { history: stepRows, plan },
    water,
    waterGap,
    gymDates,
    lifts,
    rules,
    deloadActive: activeDeloadPct(deloadWeek, today) !== undefined,
    history: toHistory(suggestions),
  };
}

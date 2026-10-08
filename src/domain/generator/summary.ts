// What the preview shows about a plan: weekly sets per muscle against the evidence band, time per
// session, WHO totals, warnings, and the rules (with their evidence ids) behind it.
import { eligibleExercises, muscleUnits, type Exercise, type ExerciseLibrary } from './library';
import {
  CARDIO_MAX_SESSION,
  CARDIO_MIN_SESSION,
  CARDIO_STEP,
  DELOAD_PCT,
  MAJOR_MUSCLES,
  SESSION_LIMITS,
  STALL_SESSIONS,
  WHO_AEROBIC_MIN,
  WHO_STRENGTH_DAYS,
  WARMUP_MIN,
  evidenceRef,
  repsFor,
  restFor,
  rirTarget,
  VOLUME,
} from './params';
import { sessionMinutes, trackedBands, weeklySets, type Band } from './plan';
import {
  MUSCLES,
  type EffectiveInput,
  type EvidenceId,
  type EvidenceRef,
  type GeneratorWarning,
  type Muscle,
  type MuscleVolume,
  type Plan,
  type PlanSummary,
  type RuleRef,
} from './types';

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Cardio fills what is left of the session after the lifting (health and fat loss, E8). */
export function assignCardio(
  plan: Plan,
  byId: ReadonlyMap<string, Exercise>,
  input: EffectiveInput,
): void {
  const wants = input.goal === 'fatLoss' || input.goal === 'health';
  for (const session of plan.sessions) {
    session.cardioMin = 0;
    if (!wants) continue;
    const left = input.sessionMin - sessionMinutes(session, byId, input);
    const minutes = Math.floor(Math.min(left, CARDIO_MAX_SESSION) / CARDIO_STEP) * CARDIO_STEP;
    session.cardioMin = minutes >= CARDIO_MIN_SESSION ? minutes : 0;
  }
}

function frequencyOf(plan: Plan, byId: ReadonlyMap<string, Exercise>, muscle: Muscle): number {
  return plan.sessions.filter((session) =>
    session.entries.some((entry) => {
      const exercise = byId.get(entry.exerciseId);
      return exercise !== undefined && muscleUnits(exercise, muscle) > 0;
    }),
  ).length;
}

function splitKind(days: number): 'full' | 'upperLower' | 'upperLowerPpl' | 'ppl' {
  if (days <= 3) return 'full';
  if (days === 4) return 'upperLower';
  return days === 5 ? 'upperLowerPpl' : 'ppl';
}

function rulesFor(input: EffectiveInput, bands: ReadonlyMap<Muscle, Band>): RuleRef[] {
  const band = VOLUME[input.goal][input.level];
  const [rirMin, rirMax] = rirTarget(input.goal, input.level);
  const [compoundReps, isolationReps] = [
    repsFor(input.goal, input.level, input.equipment, true),
    repsFor(input.goal, input.level, input.equipment, false),
  ];
  const range = (reps: readonly [number, number]) => `${reps[0]}–${reps[1]}`;
  const rules: RuleRef[] = [
    {
      id: 'volume',
      evidence: ['E1', 'E12'],
      design: true,
      params: { min: band.min, max: band.max },
    },
  ];
  if (input.goal === 'hypertrophy' && input.focusRegion) {
    rules.push({
      id: 'priority',
      evidence: ['E1', 'E12'],
      design: true,
      params: { bonus: band.priorityBonus },
    });
  }
  rules.push(
    { id: 'frequency', evidence: ['E2', 'E11'], design: false, params: { times: 2 } },
    {
      id: 'split',
      evidence: ['E11'],
      design: true,
      params: { days: input.daysPerWeek, split: splitKind(input.daysPerWeek) },
    },
    {
      id: 'loadReps',
      evidence: ['E3', 'E12'],
      design: false,
      params: { compound: range(compoundReps), isolation: range(isolationReps) },
    },
    { id: 'effort', evidence: ['E3'], design: true, params: { min: rirMin, max: rirMax } },
    {
      id: 'rest',
      evidence: ['E4'],
      design: false,
      params: {
        compound: restFor(input.goal, input.level, input.equipment, true),
        isolation: restFor(input.goal, input.level, input.equipment, false),
      },
    },
    {
      id: 'progression',
      evidence: ['E5'],
      design: true,
      params: { stall: STALL_SESSIONS, pct: DELOAD_PCT },
    },
    { id: 'warmup', evidence: ['E7'], design: true, params: { minutes: WARMUP_MIN } },
    { id: 'exerciseOrder', evidence: ['E6'], design: false, params: {} },
    {
      id: 'time',
      evidence: ['E12'],
      design: true,
      params: { minutes: input.sessionMin, sets: SESSION_LIMITS[input.level].sets },
    },
  );
  if (input.limitations.length > 0) {
    rules.push({
      id: 'limitations',
      evidence: ['E12'],
      design: true,
      params: { count: input.limitations.length },
    });
  }
  if (input.goal === 'fatLoss' || input.goal === 'health') {
    rules.push({
      id: 'cardio',
      evidence: ['E8', 'E9'],
      design: false,
      params: { target: WHO_AEROBIC_MIN },
    });
  }
  if (input.restricted) {
    rules.push({ id: 'screening', evidence: ['E10'], design: false, params: {} });
  }
  return rules;
}

export function evidenceOf(rules: readonly RuleRef[]): EvidenceRef[] {
  const ids = new Set<EvidenceId>(rules.flatMap((rule) => rule.evidence));
  return [...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map(evidenceRef);
}

export function summarize(
  input: EffectiveInput,
  plan: Plan,
  library: ExerciseLibrary,
  requestedDays: number,
): PlanSummary {
  const byId = new Map(library.map((exercise) => [exercise.id, exercise]));
  const bands = trackedBands(input);
  const sets = weeklySets(plan, byId);

  const weekly: MuscleVolume[] = MUSCLES.flatMap((muscle) => {
    const band = bands.get(muscle);
    if (!band) return [];
    const value = sets.get(muscle) ?? 0;
    return [
      {
        muscle,
        sets: round1(value),
        min: band.min,
        max: band.max,
        target: band.target,
        priority: band.priority,
        status:
          value < band.min
            ? ('low' as const)
            : value > band.max
              ? ('high' as const)
              : ('ok' as const),
        frequency: frequencyOf(plan, byId, muscle),
      },
    ];
  });

  const warnings: GeneratorWarning[] = [];
  if (input.daysPerWeek < requestedDays) {
    warnings.push({
      code: 'daysReduced',
      params: { requested: requestedDays, used: input.daysPerWeek },
    });
  }
  if (input.restricted) warnings.push({ code: 'restrictedTemplate', params: {} });
  for (const volume of weekly) {
    if (volume.status === 'low') {
      warnings.push({
        code: 'volumeBelowRange',
        params: { muscle: volume.muscle, sets: volume.sets, min: volume.min },
      });
    }
  }
  const pool = eligibleExercises(library, input);
  for (const muscle of MAJOR_MUSCLES) {
    if (!pool.some((exercise) => exercise.muscles.primary.includes(muscle))) {
      warnings.push({ code: 'noSafeExercise', params: { muscle } });
    }
  }

  const aerobicMin = plan.sessions.reduce((sum, session) => sum + session.cardioMin, 0);
  if ((input.goal === 'fatLoss' || input.goal === 'health') && aerobicMin < WHO_AEROBIC_MIN) {
    warnings.push({
      code: 'cardioBelowWho',
      params: { minutes: aerobicMin, target: WHO_AEROBIC_MIN },
    });
  }

  const rules = rulesFor(input, bands);
  return {
    daysRequested: requestedDays,
    daysUsed: plan.sessions.length,
    sessions: plan.sessions.map((session) => ({
      id: session.id,
      kind: session.kind,
      minutes: Math.round(sessionMinutes(session, byId, input)),
      sets: session.entries.reduce((sum, entry) => sum + entry.sets, 0),
      exercises: session.entries.length,
    })),
    weekly,
    who: {
      aerobicMin,
      aerobicTargetMin: WHO_AEROBIC_MIN,
      strengthDays: plan.sessions.length,
      strengthTargetDays: WHO_STRENGTH_DAYS,
    },
    warnings,
    rules,
  };
}

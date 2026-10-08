// Plan -> a program in the template JSON format (the one the importer, the rotation and "la meta de
// hoy" already use). Pure: texts come from the injected `TextResolver`.
import type { Exercise } from './library';
import { repsFor, restFor, rirTarget, STALL_SESSIONS, DELOAD_PCT } from './params';
import type { EffectiveInput, PlanSession, Program, TextResolver } from './types';

type Step = Program['routines'][number]['steps'][number];

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

function repsText(exercise: Exercise, input: EffectiveInput, t: TextResolver): string {
  const [lo, hi] =
    exercise.timeSec ?? repsFor(input.goal, input.level, input.equipment, exercise.compound);
  const range = `${lo}–${hi}${exercise.timeSec ? ' s' : ''}`;
  return exercise.unilateral ? `${range} ${t('generator.perSide')}` : range;
}

function warmupSteps(session: PlanSession, input: EffectiveInput, t: TextResolver): Step[] {
  const [rirMin, rirMax] = rirTarget(input.goal, input.level);
  const mobility = t(`generator.warmup.mobility.${session.kind}`);
  const care = input.limitations.map((joint) => t(`generator.warmup.care.${joint}`));
  return [
    { type: 'check', id: 'w-general', name: t('generator.warmup.general') },
    {
      type: 'check',
      id: 'w-mobility',
      name: [mobility, ...care].join(' '),
    },
    {
      type: 'check',
      id: 'w-effort',
      name: t(`generator.effort.${input.level}`, { min: rirMin, max: rirMax }),
    },
  ];
}

/** One routine of the program from a session of the plan. */
export function renderRoutine(
  session: PlanSession,
  byId: ReadonlyMap<string, Exercise>,
  input: EffectiveInput,
  t: TextResolver,
): Program['routines'][number] {
  const steps: Step[] = warmupSteps(session, input, t);
  let rampedUp = false;

  for (const entry of session.entries) {
    const exercise = byId.get(entry.exerciseId);
    if (!exercise) continue;
    const loadable = !exercise.bodyweight && input.equipment !== 'bodyweight';
    const muscles = unique([...exercise.muscles.primary, ...exercise.muscles.secondary]);
    // The first loaded multi-joint lift gets the ramp-up sets (E7); they never count as volume.
    const ramp = !rampedUp && exercise.compound && loadable;
    if (ramp) rampedUp = true;
    steps.push({
      type: 'sets',
      id: exercise.id,
      name: t(exercise.nameKey),
      how: t(exercise.howKey),
      sets: entry.sets,
      reps: repsText(exercise, input, t),
      restSec: restFor(input.goal, input.level, input.equipment, exercise.compound),
      muscles,
      ...(ramp ? { approach: t('generator.approach.ramp') } : {}),
      ...(loadable && exercise.incrementKg !== undefined
        ? { incrementKg: exercise.incrementKg }
        : {}),
      ...(!loadable ? { bodyweight: true } : {}),
    });
  }

  if (session.cardioMin > 0) {
    steps.push({
      type: 'timed',
      id: 'cardio',
      name: t('generator.cardio.name', { min: session.cardioMin }),
      totalSec: session.cardioMin * 60,
      segments: [{ atSec: 0, label: t('generator.cardio.easy') }],
    });
  }

  return {
    id: session.id,
    name: t(`generator.session.${session.kind}`, { letter: session.letter }),
    steps,
  };
}

export function renderProgram(
  sessions: readonly PlanSession[],
  byId: ReadonlyMap<string, Exercise>,
  input: EffectiveInput,
  t: TextResolver,
): Program {
  return {
    id: `generated-${input.goal}-${input.daysPerWeek}d`,
    name: t('generator.program.name', {
      goal: t(`generator.goal.${input.goal}`),
      days: input.daysPerWeek,
    }),
    rotation: true,
    rules: {
      progression: 'double',
      rirTarget: [...rirTarget(input.goal, input.level)] as [number, number],
      stallSessions: STALL_SESSIONS,
      deloadPct: DELOAD_PCT,
    },
    routines: sessions.map((session) => renderRoutine(session, byId, input, t)),
  };
}

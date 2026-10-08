// Glue between the screens and the repositories / timers. Everything testable lives in
// `program.ts`, `sessionViewModel.ts` and `setActions.ts`; this file only wires them to React.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { format, getDay } from 'date-fns';

import { getRepositories } from '../db';
import { todaysRoutineId } from '../domain/gym/rotation';
import { evaluateWhen } from '../domain/agenda/conditions';
import { useT } from '../i18n';
import { getTimerStore } from '../timers/store';
import type { Step } from '../templates/schema';

import { pickProgram, toRotationSessions, type GymProgram } from './program';
import {
  buildExerciseView,
  summarizeSession,
  type ExerciseView,
  type SessionSummary,
  type SetsStep,
  type StoredSet,
} from './sessionViewModel';
import { createSetActions, nextLabelFor } from './setActions';

const ROTATION_LOOKBACK = 40;

export function todayKey(date: Date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

export type GymTabState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      program: GymProgram | null;
      todayRoutineId: string | null;
      /** Routine of an unfinished session of today that already has sets (can be resumed). */
      resumableRoutineId: string | null;
    };

/** Loads the program, today's routine (rotation) and any resumable session; call `reload` on focus. */
export function useGymTab(): GymTabState & { reload: () => void } {
  const [state, setState] = useState<GymTabState>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repos = getRepositories();
        const program = pickProgram(await repos.templates.listModules());
        if (!program) {
          if (!cancelled) {
            setState({
              status: 'ready',
              program: null,
              todayRoutineId: null,
              resumableRoutineId: null,
            });
          }
          return;
        }
        const today = todayKey();
        const recent = await repos.workouts.recentSessions(ROTATION_LOOKBACK);
        const routineIds = program.routines.map((routine) => routine.id);
        const open = await repos.workouts.unfinishedSessionOn(today);
        const openWithSets = open
          ? recent.find((entry) => entry.session.id === open.id && entry.sets.length > 0)
          : undefined;
        if (!cancelled) {
          setState({
            status: 'ready',
            program,
            todayRoutineId: todaysRoutineId(routineIds, toRotationSessions(recent), today),
            resumableRoutineId:
              openWithSets && routineIds.includes(openWithSets.session.routineId)
                ? openWithSets.session.routineId
                : null,
          });
        }
      } catch (error) {
        if (__DEV__) console.error('Could not load the gym tab', error);
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

export type SessionExercise = { step: SetsStep; view: ExerciseView };

const NO_EXERCISES: readonly SessionExercise[] = [];

export type GymSessionState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'notFound' }
  | {
      status: 'ready';
      routineName: string;
      /** All steps of the routine whose `when` passes today, in order. */
      steps: readonly Step[];
      exercises: readonly SessionExercise[];
    };

export function useGymSession(routineId: string | undefined) {
  const t = useT();
  const [state, setState] = useState<GymSessionState>({ status: 'loading' });
  const [logs, setLogs] = useState<readonly StoredSet[]>([]);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const programRef = useRef<GymProgram | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const creating = useRef<Promise<number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repos = getRepositories();
        const program = pickProgram(await repos.templates.listModules());
        const routine = program?.routines.find((candidate) => candidate.id === routineId);
        if (!program || !routine) {
          if (!cancelled) setState({ status: 'notFound' });
          return;
        }
        programRef.current = program;

        const today = todayKey();
        const weekday = getDay(new Date());
        const steps = routine.steps.filter((step) => evaluateWhen(step.when, { weekday }));

        // Resume an unfinished session of today for this routine.
        const open = await repos.workouts.unfinishedSessionOn(today, routine.id);
        const stored = open ? await repos.workouts.getSession(open.id) : undefined;
        sessionIdRef.current = open?.id ?? null;

        const setsSteps = steps.filter((step): step is SetsStep => step.type === 'sets');
        const exercises = await Promise.all(
          setsSteps.map(async (step) => {
            const history = await repos.workouts.recentSessionsForStep(
              step.id,
              program.rules.stallSessions + 2,
              open?.id,
            );
            return {
              step,
              view: buildExerciseView(
                step,
                history.map(({ session, sets }) => ({ date: session.date, sets })),
                program.rules,
              ),
            };
          }),
        );
        if (cancelled) return;
        setLogs(stored?.sets ?? []);
        setState({ status: 'ready', routineName: routine.name, steps, exercises });
      } catch (error) {
        if (__DEV__) console.error('Could not load the gym session', error);
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routineId]);

  // Built per call (not memoized) because the deps read refs, which must not happen during render.
  const getActions = useCallback(
    () =>
      createSetActions({
        ensureSession: async () => {
          if (sessionIdRef.current !== null) return sessionIdRef.current;
          // Two quick ✓ must not create two sessions.
          creating.current ??= (async () => {
            const program = programRef.current;
            if (!program || !routineId) throw new Error('No routine to start');
            const id = await getRepositories().workouts.createSession({
              programId: program.id,
              routineId,
              date: todayKey(),
              startedAt: Date.now(),
            });
            sessionIdRef.current = id;
            return id;
          })();
          return creating.current;
        },
        currentSessionId: () => sessionIdRef.current,
        workouts: getRepositories().workouts,
        timers: getTimerStore().getState(),
        now: Date.now,
        t,
        haptic: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        },
      }),
    [routineId, t],
  );

  const exercises = useMemo(
    () => (state.status === 'ready' ? state.exercises : NO_EXERCISES),
    [state],
  );

  const setDone = useCallback(
    async (
      step: SetsStep,
      setIndex: number,
      values: { weightKg: number | null; reps: number | null; rir: number | null },
    ) => {
      const exerciseIndex = exercises.findIndex((exercise) => exercise.step.id === step.id);
      const nextLabel = nextLabelFor(
        exercises.map((exercise) => exercise.step),
        exerciseIndex,
        setIndex,
        t,
      );
      // Optimistic: the row flips to done immediately; a failed write puts it back.
      const optimistic: StoredSet = { stepId: step.id, setIndex, ...values };
      setLogs((current) => [
        ...current.filter((log) => !(log.stepId === step.id && log.setIndex === setIndex)),
        optimistic,
      ]);
      try {
        await getActions().markDone(step, setIndex, values, nextLabel);
      } catch {
        setLogs((current) =>
          current.filter((log) => !(log.stepId === step.id && log.setIndex === setIndex)),
        );
      }
    },
    [getActions, exercises, t],
  );

  const setUndone = useCallback(
    async (step: SetsStep, setIndex: number) => {
      setLogs((current) =>
        current.filter((log) => !(log.stepId === step.id && log.setIndex === setIndex)),
      );
      await getActions()
        .markUndone(step, setIndex)
        .catch(() => undefined);
    },
    [getActions],
  );

  const setRir = useCallback(
    async (step: SetsStep, setIndex: number, rir: number | null) => {
      const current = logs.find((log) => log.stepId === step.id && log.setIndex === setIndex);
      if (!current) return;
      const updated = await getActions()
        .updateRir(step, current, rir)
        .catch(() => current);
      setLogs((all) => all.map((log) => (log === current ? updated : log)));
    },
    [getActions, logs],
  );

  const startHold = useCallback(
    (step: SetsStep, setIndex: number) => getActions().startHold(step, setIndex),
    [getActions],
  );

  /** Finishes the session (if any set was logged) and returns the summary, or `null` if none. */
  const finish = useCallback(async (): Promise<SessionSummary | null> => {
    getTimerStore().getState().cancel();
    const sessionId = sessionIdRef.current;
    if (sessionId === null) return null;
    await getRepositories().workouts.finishSession(sessionId, Date.now());
    const result = summarizeSession(
      exercises.map(({ step, view }) => ({ step, target: view.target })),
      logs,
    );
    setSummary(result);
    return result;
  }, [exercises, logs]);

  const setsDone = useMemo(
    () =>
      logs.filter(
        (log) =>
          exercises.some((exercise) => exercise.step.id === log.stepId) && (log.reps ?? 0) > 0,
      ).length,
    [exercises, logs],
  );

  return { state, logs, summary, setDone, setUndone, setRir, startHold, finish, setsDone };
}

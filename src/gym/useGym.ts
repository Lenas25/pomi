// Glue between the screens and the repositories / timers. Everything testable lives in
// `program.ts`, `sessionViewModel.ts` and `setActions.ts`; this file only wires them to React.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { getDay, parseISO } from 'date-fns';

import { getRepositories } from '../db';
import { todaysRoutineId } from '../domain/gym/rotation';
import { evaluateWhen } from '../domain/agenda/conditions';
import { dayKeyFor } from '../domain/time';
import { useT } from '../i18n';
import { requestNotificationSync } from '../notifications/sync';
import { getTimerStore } from '../timers/store';
import type { Step } from '../templates/schema';

import { activeDeloadPct } from './deload';
import { pickProgram, toRotationSessions, type GymProgram } from './program';
import {
  buildExerciseView,
  groupLogsByStep,
  summarizeSession,
  type ExerciseView,
  type SessionSummary,
  type SetsStep,
  type StoredSet,
} from './sessionViewModel';
import { createKeyedQueue, memoizeUntilFailure } from './asyncControl';
import { createSetActions, nextLabelFor } from './setActions';

const ROTATION_LOOKBACK = 40;

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
        const today = dayKeyFor(new Date());
        // A workout left open on an earlier day (app killed) is closed at its last set.
        await repos.workouts.finishStaleSessions(today);
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

export type GymSessionError = { kind: 'saveSet' | 'finish'; id: number };

export type FinishResult =
  { status: 'finished'; summary: SessionSummary } | { status: 'empty' } | { status: 'error' };

export function useGymSession(routineId: string | undefined) {
  const t = useT();
  const [state, setState] = useState<GymSessionState>({ status: 'loading' });
  // The logs and their per-step grouping change together; the grouping reuses unchanged arrays so
  // memoized exercise cards re-render only when their own sets change.
  const [{ logs, logsByStep }, setLogState] = useState<{
    logs: readonly StoredSet[];
    logsByStep: ReadonlyMap<string, readonly StoredSet[]>;
  }>({ logs: [], logsByStep: new Map() });
  const setLogs = useCallback(
    (update: (current: readonly StoredSet[]) => readonly StoredSet[]) =>
      setLogState((previous) => {
        const next = update(previous.logs);
        return { logs: next, logsByStep: groupLogsByStep(next, previous.logsByStep) };
      }),
    [],
  );
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const programRef = useRef<GymProgram | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const creating = useRef<(() => Promise<number>) | null>(null);
  const logsRef = useRef<readonly StoredSet[]>([]);
  // Writes to the same set run one after another (✓ then un-✓ must not interleave).
  const [queue] = useState(createKeyedQueue);
  const [error, setError] = useState<GymSessionError | null>(null);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

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

        const today = dayKeyFor(new Date());
        const deloadPct = activeDeloadPct(await repos.settings.get('deloadWeek'), today);
        await repos.workouts.finishStaleSessions(today);
        const weekday = getDay(parseISO(today));
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
                deloadPct,
              ),
            };
          }),
        );
        if (cancelled) return;
        setLogs(() => stored?.sets ?? []);
        setState({ status: 'ready', routineName: routine.name, steps, exercises });
      } catch (error) {
        if (__DEV__) console.error('Could not load the gym session', error);
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routineId, setLogs]);

  // Built per call (not memoized) because the deps read refs, which must not happen during render.
  const getActions = useCallback(
    () =>
      createSetActions({
        ensureSession: async () => {
          if (sessionIdRef.current !== null) return sessionIdRef.current;
          // Two quick ✓ share one creation; a failed creation is retried by the next ✓.
          creating.current ??= memoizeUntilFailure(async () => {
            const program = programRef.current;
            if (!program || !routineId) throw new Error('No routine to start');
            const id = await getRepositories().workouts.createSession({
              programId: program.id,
              routineId,
              date: dayKeyFor(new Date()),
              startedAt: Date.now(),
            });
            sessionIdRef.current = id;
            return id;
          });
          return creating.current();
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
    (
      step: SetsStep,
      setIndex: number,
      values: { weightKg: number | null; reps: number | null; rir: number | null },
    ): Promise<void> => {
      const exerciseIndex = exercises.findIndex((exercise) => exercise.step.id === step.id);
      const nextLabel = nextLabelFor(
        exercises.map((exercise) => exercise.step),
        exerciseIndex,
        setIndex,
        t,
      );
      const matches = (log: StoredSet) => log.stepId === step.id && log.setIndex === setIndex;
      // Optimistic: the row flips to done immediately; a failed write puts it back.
      const optimistic: StoredSet = { stepId: step.id, setIndex, ...values };
      setLogs((current) => [...current.filter((log) => !matches(log)), optimistic]);
      return queue.run(`${step.id}:${setIndex}`, async () => {
        try {
          await getActions().markDone(step, setIndex, values, nextLabel);
        } catch {
          setLogs((current) => current.filter((log) => !matches(log)));
          setError({ kind: 'saveSet', id: Date.now() });
        }
      });
    },
    [getActions, exercises, queue, setLogs, t],
  );

  const setUndone = useCallback(
    (step: SetsStep, setIndex: number): Promise<void> => {
      setLogs((current) =>
        current.filter((log) => !(log.stepId === step.id && log.setIndex === setIndex)),
      );
      return queue.run(`${step.id}:${setIndex}`, () =>
        getActions()
          .markUndone(step, setIndex)
          .catch(() => setError({ kind: 'saveSet', id: Date.now() })),
      );
    },
    [getActions, queue, setLogs],
  );

  const setRir = useCallback(
    (step: SetsStep, setIndex: number, rir: number | null): Promise<void> => {
      const exists = logsRef.current.some(
        (log) => log.stepId === step.id && log.setIndex === setIndex,
      );
      if (!exists) return Promise.resolve();
      return queue.run(`${step.id}:${setIndex}`, async () => {
        try {
          await getActions().updateRir(step, setIndex, rir);
          setLogs((all) =>
            all.map((log) =>
              log.stepId === step.id && log.setIndex === setIndex ? { ...log, rir } : log,
            ),
          );
        } catch {
          setError({ kind: 'saveSet', id: Date.now() });
        }
      });
    },
    [getActions, queue, setLogs],
  );

  const startHold = useCallback(
    (step: SetsStep, setIndex: number) => getActions().startHold(step, setIndex),
    [getActions],
  );

  /**
   * Finishes the session (if any set was logged). A failure keeps the session open (and its
   * timers running) and raises the error toast.
   */
  const finish = useCallback(async (): Promise<FinishResult> => {
    try {
      await queue.idle();
      const sessionId = sessionIdRef.current;
      if (sessionId === null) {
        getTimerStore().getState().cancel();
        return { status: 'empty' };
      }
      await getRepositories().workouts.finishSession(sessionId, Date.now());
      getTimerStore().getState().cancel();
      const result = summarizeSession(
        exercises.map(({ step, view }) => ({ step, target: view.target })),
        logs,
      );
      setSummary(result);
      void requestNotificationSync('dataChanged');
      return { status: 'finished', summary: result };
    } catch {
      setError({ kind: 'finish', id: Date.now() });
      return { status: 'error' };
    }
  }, [exercises, logs, queue]);

  const clearError = useCallback(() => setError(null), []);

  const setsDone = useMemo(
    () =>
      logs.filter(
        (log) =>
          exercises.some((exercise) => exercise.step.id === log.stepId) && (log.reps ?? 0) > 0,
      ).length,
    [exercises, logs],
  );

  return {
    state,
    logs,
    logsByStep,
    summary,
    error,
    clearError,
    setDone,
    setUndone,
    setRir,
    startHold,
    finish,
    setsDone,
  };
}

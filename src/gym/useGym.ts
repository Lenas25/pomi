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
import {
  pickProgram,
  resumableRoutineIds,
  ROTATION_LOOKBACK,
  toRotationSessions,
  type GymProgram,
} from './program';
import {
  buildExerciseView,
  groupLogsByStep,
  summarizeSession,
  type ExerciseView,
  type SessionSummary,
  type SetsStep,
  type StoredSet,
} from './sessionViewModel';
import { plannedPerWeek } from '../domain/progress/weekly';
import { loadGymGoal, type GymGoal } from '../today/gymGoal';
import { historyEntries, sessionsThisWeek, type HistoryEntry } from './gymHistory';
import { createKeyedQueue, memoizeUntilFailure } from './asyncControl';
import { loadVolumeData, type VolumeData } from '../volume/loadVolume';
import { createSetActions, nextLabelFor } from './setActions';
import type { LocalizedText } from '../templates/localized';

export type GymTabState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      program: GymProgram | null;
      todayRoutineId: string | null;
      /** Routines with an unfinished session of today that already has sets (can be resumed). */
      resumableRoutineIds: readonly string[];
      /** Weekly volume per muscle; `null` when it could not be computed (never blocks the tab). */
      volume: VolumeData | null;
      /** "Meta de hoy" of the first main exercise of each routine, by routine id. */
      goals: Readonly<Record<string, GymGoal>>;
      /** Sessions with sets this ISO week, and gym days planned per week (0 = no plan). */
      week: { done: number; planned: number };
      /** Recent sessions with logged sets, newest first. */
      history: HistoryEntry[];
    };

/**
 * Loads the program, today's routine (rotation) and any resumable session. Nothing loads until
 * the first `reload` (call it on focus, which also covers mount).
 */
export function useGymTab(): GymTabState & { reload: () => void } {
  const [state, setState] = useState<GymTabState>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    // The screens load on focus (`reload`), which also runs on mount: loading here as well
    // would read everything twice.
    if (version === 0) return;
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
              resumableRoutineIds: [],
              volume: null,
              goals: {},
              week: { done: 0, planned: 0 },
              history: [],
            });
          }
          return;
        }
        const today = dayKeyFor(new Date());
        // A workout left open on an earlier day (app killed) is closed at its last set.
        await repos.workouts.finishStaleSessions(today);
        const [recent, volume, deloadWeek, gymDays] = await Promise.all([
          repos.workouts.recentSessions(ROTATION_LOOKBACK),
          loadVolumeData(repos, today).catch((error: unknown) => {
            if (__DEV__) console.warn('Could not compute the weekly volume', error);
            return null;
          }),
          repos.settings.get('deloadWeek'),
          repos.settings.get('gymDays'),
        ]);
        const routineIds = program.routines.map((routine) => routine.id);
        const todayRoutineId = todaysRoutineId(routineIds, toRotationSessions(recent), today);
        const weekday = getDay(parseISO(today));
        const deloadPct = activeDeloadPct(deloadWeek, today);
        // Every routine gets its goal: the carousel lets the person start any of them.
        const loaded = await Promise.all(
          program.routines.map(async (routine) => {
            const goal = await loadGymGoal(repos, routine, program.rules, weekday, deloadPct).catch(
              () => undefined,
            );
            return [routine.id, goal] as const;
          }),
        );
        const goals: Record<string, GymGoal> = {};
        for (const [id, goal] of loaded) if (goal) goals[id] = goal;
        const planned = plannedPerWeek(gymDays ?? []);
        if (!cancelled) {
          setState({
            status: 'ready',
            program,
            todayRoutineId,
            resumableRoutineIds: resumableRoutineIds(recent, today, routineIds),
            volume,
            goals,
            week: { done: sessionsThisWeek(recent, today), planned },
            history: historyEntries(recent, program),
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
      routineName: LocalizedText;
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

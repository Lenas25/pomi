// The ONE active timer of the app (a rest, a wait step or a cardio block). The store holds the pure
// `TimerState` plus the id of the scheduled "time is up" notification, and keeps the notification
// in sync with every transition: scheduled on start/resume/+30 s, cancelled on pause/skip/cancel.
// Side effects are injected (`TimerEffects`) so the store is testable without Expo.
import { createStore, type StoreApi } from 'zustand/vanilla';

import {
  addTime,
  pauseTimer,
  resumeTimer,
  skipTimer,
  startTimer,
  syncTimer,
  type TimerSegment,
  type TimerState,
} from './timerModel';

export type TimerKind = 'rest' | 'wait' | 'cardio';

/** Text of the end-of-timer notification (already translated by the caller). */
export type TimerNotification = { title: string; body: string };

export type TimerEffects = {
  /** Schedules ONE local notification at `endsAt`; resolves to its id, or `null` if not possible. */
  schedule(endsAt: number, content: TimerNotification): Promise<string | null>;
  cancel(notificationId: string): Promise<void>;
};

export type ActiveTimer = {
  /** Who started it, e.g. `rest:ht:0`. A ✓ undone later cancels only its own timer. */
  owner: string;
  kind: TimerKind;
  state: TimerState;
  /** Display name of what is running / what comes next ("Siguiente: serie 3"). */
  nextLabel: string | null;
  notification: TimerNotification;
  segments: readonly TimerSegment[];
  notificationId: string | null;
  /** How it ended, once finished: the clock ran out or the person skipped it. */
  finishedBy: 'elapsed' | 'skipped' | null;
  /** The end timestamp it reached when it ran out (to tell "just now" from "in the background"). */
  finishedAt: number | null;
  /** Module-wide monotonic id of every (re)schedule, so a late scheduling result can be told apart. */
  revision: number;
  /** When this run began (identifies the run together with `owner`; unchanged by pause/+30 s). */
  startedAt: number;
};

export type StartTimerInput = {
  owner: string;
  kind: TimerKind;
  durationSec: number;
  nextLabel?: string | null;
  notification: TimerNotification;
  segments?: readonly TimerSegment[];
};

export type TimerStoreState = {
  active: ActiveTimer | null;
  start(input: StartTimerInput): void;
  pause(): void;
  resume(): void;
  addTime(sec?: number): void;
  skip(): void;
  /** Cancels the active timer only when `owner` started it (or always, without `owner`). */
  cancel(owner?: string): void;
  /** Re-derives the state from the clock; call on every tick and on app foreground. */
  sync(): void;
  /** Hides a finished timer. */
  dismiss(): void;
};

export type TimerStore = StoreApi<TimerStoreState>;

// Monotonic across ALL stores and runs: a revision is never reused, so a scheduling result from
// an old run can never match a newer timer (even one with the same owner after cancel + start).
let revisionCounter = 0;
const nextRevision = (): number => {
  revisionCounter += 1;
  return revisionCounter;
};

export function createTimerStore(effects: TimerEffects, now: () => number = Date.now): TimerStore {
  return createStore<TimerStoreState>((set, get) => {
    const cancelNotification = (id: string | null) => {
      if (id !== null) void effects.cancel(id).catch(() => undefined);
    };

    /** Schedules the end notification for the current run and stores its id when it returns. */
    const schedule = (timer: ActiveTimer) => {
      if (timer.state.status !== 'running') return;
      const revision = timer.revision;
      const owner = timer.owner;
      effects
        .schedule(timer.state.endsAt, timer.notification)
        .then((id) => {
          if (id === null) return;
          const current = get().active;
          // The timer changed while the notification was being scheduled: drop the stale one.
          if (!current || current.owner !== owner || current.revision !== revision) {
            cancelNotification(id);
            return;
          }
          set({ active: { ...current, notificationId: id } });
        })
        .catch(() => undefined);
    };

    /** Replaces the state, dropping the old notification and scheduling a new one if running. */
    const transition = (update: (timer: ActiveTimer) => Partial<ActiveTimer>) => {
      const current = get().active;
      if (!current) return;
      cancelNotification(current.notificationId);
      const next: ActiveTimer = {
        ...current,
        ...update(current),
        notificationId: null,
        revision: nextRevision(),
      };
      set({ active: next });
      schedule(next);
    };

    return {
      active: null,

      start(input) {
        const previous = get().active;
        cancelNotification(previous?.notificationId ?? null);
        const timer: ActiveTimer = {
          owner: input.owner,
          kind: input.kind,
          state: startTimer(now(), input.durationSec),
          nextLabel: input.nextLabel ?? null,
          notification: input.notification,
          segments: input.segments ?? [],
          notificationId: null,
          finishedBy: null,
          finishedAt: null,
          revision: nextRevision(),
          startedAt: now(),
        };
        set({ active: timer });
        schedule(timer);
      },

      pause() {
        // A timer that already ran out finishes through the normal "elapsed" path (alarm included).
        get().sync();
        if (get().active?.state.status !== 'running') return;
        transition((timer) => ({ state: pauseTimer(timer.state, now()) }));
      },

      resume() {
        transition((timer) => ({ state: resumeTimer(timer.state, now()) }));
      },

      addTime(sec) {
        get().sync();
        const status = get().active?.state.status;
        if (status === undefined || status === 'finished') return;
        transition((timer) => ({ state: addTime(timer.state, now(), sec) }));
      },

      skip() {
        const current = get().active;
        if (!current || current.state.status === 'finished') return;
        cancelNotification(current.notificationId);
        set({
          active: {
            ...current,
            state: skipTimer(current.state),
            notificationId: null,
            finishedBy: 'skipped',
            revision: nextRevision(),
          },
        });
      },

      cancel(owner) {
        const current = get().active;
        if (!current || (owner !== undefined && current.owner !== owner)) return;
        cancelNotification(current.notificationId);
        set({ active: null });
      },

      sync() {
        const current = get().active;
        if (!current || current.state.status !== 'running') return;
        const next = syncTimer(current.state, now());
        if (next === current.state) return;
        // Ran out: the notification (if it did not fire yet) is no longer needed.
        cancelNotification(current.notificationId);
        set({
          active: {
            ...current,
            state: next,
            notificationId: null,
            finishedBy: 'elapsed',
            finishedAt: current.state.status === 'running' ? current.state.endsAt : now(),
            revision: nextRevision(),
          },
        });
      },

      dismiss() {
        const current = get().active;
        if (current?.state.status === 'finished') set({ active: null });
      },
    };
  });
}

// What a ✓ does: persist the set and start the rest timer; ✓ again: remove the log and cancel THAT
// rest. Expo-free (haptics and timers come in as dependencies) so it can be unit tested.
import type { Translate } from '../i18n';
import type { WorkoutsRepository } from '../db/repositories/workouts';
import type { StartTimerInput, TimerStoreState } from '../timers/timerStore';

import type { SetsStep, StoredSet } from './sessionViewModel';

export function restOwner(stepId: string, setIndex: number): string {
  return `rest:${stepId}:${setIndex}`;
}

export function holdOwner(stepId: string, setIndex: number): string {
  return `hold:${stepId}:${setIndex}`;
}

/** "Siguiente: serie 3 de …" / the next exercise / `null` after the very last set. */
export function nextLabelFor(
  exercises: readonly SetsStep[],
  exerciseIndex: number,
  setIndex: number,
  t: Translate,
): string | null {
  const step = exercises[exerciseIndex];
  if (!step) return null;
  if (setIndex + 1 < step.sets) {
    return t('timers.nextSet', { n: setIndex + 2, name: step.name });
  }
  const next = exercises[exerciseIndex + 1];
  return next ? t('timers.nextExercise', { name: next.name }) : null;
}

export type SetActionsDeps = {
  /** Creates the session on the first ✓ (so opening a routine and leaving leaves no trace). */
  ensureSession: () => Promise<number>;
  /** The session id if it exists already (nothing to unlog otherwise). */
  currentSessionId: () => number | null;
  workouts: Pick<WorkoutsRepository, 'logSet' | 'unlogSet' | 'updateRir'>;
  timers: Pick<TimerStoreState, 'start' | 'cancel'>;
  now: () => number;
  t: Translate;
  /** Medium impact on ✓ (HANDOFF §6). */
  haptic: () => void;
};

export type DoneValues = { weightKg: number | null; reps: number | null; rir: number | null };

export function createSetActions(deps: SetActionsDeps) {
  const { workouts, timers, t } = deps;

  return {
    /**
     * ✓ on a set: haptic, rest timer and persistence. The timer starts before the write so the
     * rest begins on the tap; if the write fails the timer is cancelled and the error rethrown.
     */
    async markDone(
      step: SetsStep,
      setIndex: number,
      values: DoneValues,
      nextLabel: string | null,
    ): Promise<StoredSet> {
      deps.haptic();
      const owner = restOwner(step.id, setIndex);
      if (step.restSec > 0) {
        timers.start({
          owner,
          kind: 'rest',
          durationSec: step.restSec,
          nextLabel,
          notification: {
            title: t('timers.notification.restTitle'),
            body: nextLabel
              ? t('timers.notification.body', { next: nextLabel })
              : t('timers.notification.bodyDefault'),
          },
        });
      }
      try {
        const sessionId = await deps.ensureSession();
        await workouts.logSet({
          sessionId,
          stepId: step.id,
          setIndex,
          weightKg: values.weightKg,
          reps: values.reps,
          rir: values.rir,
          doneAt: deps.now(),
        });
      } catch (error) {
        timers.cancel(owner);
        throw error;
      }
      return { stepId: step.id, setIndex, ...values };
    },

    /** ✓ again: unlog the set and cancel the rest that this set started (and only that one). */
    async markUndone(step: SetsStep, setIndex: number): Promise<void> {
      timers.cancel(restOwner(step.id, setIndex));
      const sessionId = deps.currentSessionId();
      if (sessionId !== null) await workouts.unlogSet(sessionId, step.id, setIndex);
    },

    /** Changes ONLY the RIR of a logged set (its numbers and `doneAt` stay as logged). */
    async updateRir(step: SetsStep, setIndex: number, rir: number | null): Promise<void> {
      const sessionId = deps.currentSessionId();
      if (sessionId !== null) await workouts.updateRir(sessionId, step.id, setIndex, rir);
    },

    /** `holdSec` exercises: a short timer for the hold (the ✓ then starts the real rest). */
    startHold(step: SetsStep, setIndex: number): void {
      if (step.holdSec === undefined) return;
      const input: StartTimerInput = {
        owner: holdOwner(step.id, setIndex),
        kind: 'wait',
        durationSec: step.holdSec,
        nextLabel: null,
        notification: {
          title: t('timers.notification.holdTitle'),
          body: t('timers.notification.bodyDefault'),
        },
      };
      timers.start(input);
    },
  };
}

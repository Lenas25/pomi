// Pure timer model (PLAN §7.2). A running timer stores the END timestamp, never a counter, so it
// survives backgrounding: every view re-derives the remaining time from `now`. No React, no Expo,
// no clock access (callers pass `now`, in epoch ms).

export type TimerState =
  | { status: 'running'; endsAt: number; totalMs: number }
  | { status: 'paused'; remainingMs: number; totalMs: number }
  | { status: 'finished'; totalMs: number };

export const ADD_TIME_SEC = 30;

export function startTimer(now: number, durationSec: number): TimerState {
  const totalMs = Math.max(0, Math.round(durationSec * 1000));
  return totalMs === 0
    ? { status: 'finished', totalMs }
    : { status: 'running', endsAt: now + totalMs, totalMs };
}

/** Milliseconds left (never negative). A finished timer has none. */
export function remainingMs(state: TimerState, now: number): number {
  switch (state.status) {
    case 'running':
      return Math.max(0, state.endsAt - now);
    case 'paused':
      return state.remainingMs;
    case 'finished':
      return 0;
  }
}

/** Whole seconds left, rounded UP so the display shows 0:01 until the very end. */
export function remainingSec(state: TimerState, now: number): number {
  return Math.ceil(remainingMs(state, now) / 1000);
}

/** 0..1 of the total already elapsed. */
export function progress(state: TimerState, now: number): number {
  if (state.status === 'finished') return 1;
  if (state.totalMs <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remainingMs(state, now) / state.totalMs));
}

export function elapsedSec(state: TimerState, now: number): number {
  return Math.max(0, (state.totalMs - remainingMs(state, now)) / 1000);
}

/**
 * Re-derives the state from the clock: a running timer whose end has passed is finished. Call it
 * on every tick and when the app returns to the foreground.
 */
export function syncTimer(state: TimerState, now: number): TimerState {
  if (state.status === 'running' && now >= state.endsAt) {
    return { status: 'finished', totalMs: state.totalMs };
  }
  return state;
}

/** Pause stores the remaining time; only a running timer can be paused. */
export function pauseTimer(state: TimerState, now: number): TimerState {
  const current = syncTimer(state, now);
  if (current.status !== 'running') return current;
  return { status: 'paused', remainingMs: remainingMs(current, now), totalMs: current.totalMs };
}

/** Resume turns the stored remaining time into a new end timestamp. */
export function resumeTimer(state: TimerState, now: number): TimerState {
  if (state.status !== 'paused') return state;
  return { status: 'running', endsAt: now + state.remainingMs, totalMs: state.totalMs };
}

/**
 * Adds time (default +30 s). A finished timer is NOT revived: the rest is over and the person
 * would start a new one. The total grows too, so the ring never goes past 100%.
 */
export function addTime(state: TimerState, now: number, sec: number = ADD_TIME_SEC): TimerState {
  const current = syncTimer(state, now);
  const ms = Math.round(sec * 1000);
  switch (current.status) {
    case 'running':
      return { ...current, endsAt: current.endsAt + ms, totalMs: current.totalMs + ms };
    case 'paused':
      return {
        ...current,
        remainingMs: current.remainingMs + ms,
        totalMs: current.totalMs + ms,
      };
    case 'finished':
      return current;
  }
}

export function skipTimer(state: TimerState): TimerState {
  return { status: 'finished', totalMs: state.totalMs };
}

/** The 3-2-1 countdown beep to play for the remaining time, or `null` outside the last 3 s. */
export function countdownCue(state: TimerState, now: number): 1 | 2 | 3 | null {
  if (state.status !== 'running') return null;
  const sec = remainingSec(state, now);
  return sec === 1 || sec === 2 || sec === 3 ? sec : null;
}

export type TimerSegment = { atSec: number; label: string };

/** The segment of a `timed` step in effect after `elapsed` seconds (`null` before the first). */
export function currentSegment(
  segments: readonly TimerSegment[],
  elapsed: number,
): { index: number; label: string } | null {
  let found: { index: number; label: string } | null = null;
  segments.forEach((segment, index) => {
    if (
      segment.atSec <= elapsed &&
      (found === null || segment.atSec >= (segments[found.index]?.atSec ?? 0))
    ) {
      found = { index, label: segment.label };
    }
  });
  return found;
}

/** Whether the segment index changed between two instants (a cue for the beep + new label). */
export function segmentChanged(
  segments: readonly TimerSegment[],
  previousElapsed: number,
  elapsed: number,
): boolean {
  const before = currentSegment(segments, previousElapsed);
  const after = currentSegment(segments, elapsed);
  return after !== null && before?.index !== after.index;
}

/** A run observed for the first time this early still counts as "just started". */
export const SEGMENT_START_GRACE_SEC = 2;

/**
 * The label to cue (beep + announcement) for a tick, or `null`. `previousElapsed` is `null` on the
 * FIRST tick of a run, which only sets the baseline: nothing is cued, except that a run seen right
 * after it started cues the segment in effect (a segment at 0 s is the start of the block).
 */
export function segmentCue(
  segments: readonly TimerSegment[],
  previousElapsed: number | null,
  elapsed: number,
): string | null {
  if (previousElapsed === null) {
    return elapsed <= SEGMENT_START_GRACE_SEC
      ? (currentSegment(segments, elapsed)?.label ?? null)
      : null;
  }
  return segmentChanged(segments, previousElapsed, elapsed)
    ? (currentSegment(segments, elapsed)?.label ?? null)
    : null;
}

/** `m:ss` for the ring. */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

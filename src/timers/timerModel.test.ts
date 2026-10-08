import { describe, expect, it } from '@jest/globals';

import {
  addTime,
  countdownCue,
  currentSegment,
  elapsedSec,
  formatClock,
  pauseTimer,
  progress,
  remainingMs,
  segmentCue,
  remainingSec,
  resumeTimer,
  segmentChanged,
  skipTimer,
  startTimer,
  syncTimer,
} from './timerModel';

const T0 = 1_000_000;

describe('timer model', () => {
  it('stores the end timestamp and derives the remaining time from the clock', () => {
    const timer = startTimer(T0, 120);
    expect(timer).toEqual({ status: 'running', endsAt: T0 + 120_000, totalMs: 120_000 });
    expect(remainingSec(timer, T0)).toBe(120);
    expect(remainingSec(timer, T0 + 30_500)).toBe(90);
    expect(remainingMs(timer, T0 + 999_999)).toBe(0);
  });

  it('rounds the displayed seconds up (0:01 until the very end)', () => {
    const timer = startTimer(T0, 10);
    expect(remainingSec(timer, T0 + 9_001)).toBe(1);
    expect(remainingSec(timer, T0 + 10_000)).toBe(0);
  });

  it('recomputes after a long time in the background', () => {
    const timer = startTimer(T0, 120);
    // Backgrounded 90 s: still running with 30 s left.
    expect(remainingSec(syncTimer(timer, T0 + 90_000), T0 + 90_000)).toBe(30);
    // Backgrounded 10 minutes: finished once synced.
    expect(syncTimer(timer, T0 + 600_000)).toEqual({ status: 'finished', totalMs: 120_000 });
  });

  it('pauses by storing the remaining time and resumes with a new end', () => {
    const paused = pauseTimer(startTimer(T0, 120), T0 + 45_000);
    expect(paused).toEqual({ status: 'paused', remainingMs: 75_000, totalMs: 120_000 });
    // Time passing while paused changes nothing.
    expect(remainingSec(paused, T0 + 500_000)).toBe(75);
    const resumed = resumeTimer(paused, T0 + 500_000);
    expect(resumed).toEqual({ status: 'running', endsAt: T0 + 575_000, totalMs: 120_000 });
  });

  it('pausing a timer that already ended finishes it instead', () => {
    expect(pauseTimer(startTimer(T0, 10), T0 + 20_000).status).toBe('finished');
  });

  it('adds 30 s to a running and to a paused timer, growing the total', () => {
    const running = addTime(startTimer(T0, 60), T0 + 10_000);
    expect(running).toEqual({ status: 'running', endsAt: T0 + 90_000, totalMs: 90_000 });
    const paused = addTime(pauseTimer(startTimer(T0, 60), T0 + 10_000), T0 + 10_000);
    expect(paused).toEqual({ status: 'paused', remainingMs: 80_000, totalMs: 90_000 });
  });

  it('does not revive a finished timer with +30 s', () => {
    const done = skipTimer(startTimer(T0, 60));
    expect(addTime(done, T0)).toBe(done);
    expect(addTime(startTimer(T0, 10), T0 + 20_000).status).toBe('finished');
  });

  it('skips straight to finished and reports full progress', () => {
    const skipped = skipTimer(startTimer(T0, 60));
    expect(skipped.status).toBe('finished');
    expect(progress(skipped, T0)).toBe(1);
    expect(remainingMs(skipped, T0)).toBe(0);
  });

  it('computes progress and elapsed time', () => {
    const timer = startTimer(T0, 100);
    expect(progress(timer, T0 + 25_000)).toBeCloseTo(0.25);
    expect(elapsedSec(timer, T0 + 25_000)).toBeCloseTo(25);
    expect(progress(startTimer(T0, 0), T0)).toBe(1);
  });

  it('emits the 3-2-1 cue only while running in the last 3 seconds', () => {
    const timer = startTimer(T0, 10);
    expect(countdownCue(timer, T0 + 6_000)).toBeNull();
    expect(countdownCue(timer, T0 + 7_100)).toBe(3);
    expect(countdownCue(timer, T0 + 8_100)).toBe(2);
    expect(countdownCue(timer, T0 + 9_100)).toBe(1);
    expect(countdownCue(timer, T0 + 10_000)).toBeNull();
    expect(countdownCue(pauseTimer(timer, T0 + 8_100), T0 + 8_100)).toBeNull();
  });
});

describe('segments', () => {
  const segments = [
    { atSec: 0, label: 'a' },
    { atSec: 300, label: 'b' },
    { atSec: 600, label: 'c' },
  ];

  it('finds the segment in effect', () => {
    expect(currentSegment(segments, 0)).toEqual({ index: 0, label: 'a' });
    expect(currentSegment(segments, 299.9)).toEqual({ index: 0, label: 'a' });
    expect(currentSegment(segments, 300)).toEqual({ index: 1, label: 'b' });
    expect(currentSegment(segments, 9999)).toEqual({ index: 2, label: 'c' });
    expect(currentSegment([{ atSec: 30, label: 'x' }], 10)).toBeNull();
    expect(currentSegment([], 10)).toBeNull();
  });

  it('detects a segment change between two instants', () => {
    expect(segmentChanged(segments, 299, 300)).toBe(true);
    expect(segmentChanged(segments, 10, 20)).toBe(false);
    // Backgrounded across a boundary: still one change.
    expect(segmentChanged(segments, 100, 700)).toBe(true);
  });
});

describe('formatClock', () => {
  it('formats m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(80)).toBe('1:20');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('segmentCue', () => {
  const segments = [
    { atSec: 0, label: 'Easy' },
    { atSec: 300, label: 'Hard' },
  ];

  it('cues the segment at 0 s when the run is seen right after it started', () => {
    expect(segmentCue(segments, null, 0.3)).toBe('Easy');
  });

  it('treats the first tick of a run seen mid-way as a silent baseline', () => {
    expect(segmentCue(segments, null, 310)).toBeNull();
  });

  it('cues only when the segment changes afterwards', () => {
    expect(segmentCue(segments, 100, 200)).toBeNull();
    expect(segmentCue(segments, 299.8, 300.1)).toBe('Hard');
  });

  it('has nothing to cue before the first segment', () => {
    expect(segmentCue([{ atSec: 60, label: 'Go' }], null, 0.2)).toBeNull();
  });
});

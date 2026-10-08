import {
  HEAVY_INTERVAL_MS,
  intervalFor,
  isHeavyDue,
  runBackgroundJob,
  shouldRegister,
  type JobDeps,
} from './backgroundPolicy';

const NOW = new Date(2026, 9, 8, 12, 0).getTime();

function deps(overrides: Partial<JobDeps> = {}) {
  const calls: string[] = [];
  const base: JobDeps = {
    now: () => new Date(NOW),
    bootstrap: async () => {
      calls.push('bootstrap');
    },
    lastHeavyRunAt: async () => undefined,
    saveHeavyRunAt: async () => {
      calls.push('stamp');
    },
    suggestions: async () => {
      calls.push('suggestions');
    },
    sync: async () => {
      calls.push('sync');
    },
    nudge: async () => {
      calls.push('nudge');
    },
  };
  return { calls, deps: { ...base, ...overrides } };
}

describe('background policy', () => {
  it('heavy work is due after 6 h, never before, and after a clock set back', () => {
    expect(isHeavyDue(undefined, NOW)).toBe(true);
    expect(isHeavyDue(NOW - HEAVY_INTERVAL_MS + 1, NOW)).toBe(false);
    expect(isHeavyDue(NOW - HEAVY_INTERVAL_MS, NOW)).toBe(true);
    expect(isHeavyDue(NOW + 1000, NOW)).toBe(true);
  });

  it('falls back to the 6 h cadence without the background permission', () => {
    expect(intervalFor({ enabled: true }, true)).toBe(15);
    expect(intervalFor({ enabled: true }, false)).toBe(360);
    expect(intervalFor({ enabled: true, noPhone: true }, true)).toBe(360);
  });

  it('registers only when not registered or when the cadence flipped', () => {
    expect(shouldRegister(15, 15, true)).toBe(false);
    expect(shouldRegister(15, 360, true)).toBe(true);
    expect(shouldRegister(360, 360, false)).toBe(true);
    expect(shouldRegister(360, undefined, true)).toBe(true);
  });

  it('runs heavy work and the nudge when due', async () => {
    const { calls, deps: d } = deps();
    expect(await runBackgroundJob(d)).toBe('success');
    expect(calls).toEqual(['bootstrap', 'stamp', 'suggestions', 'sync', 'nudge']);
  });

  it('skips heavy work inside the 6 h window but still tries the nudge', async () => {
    const { calls, deps: d } = deps({ lastHeavyRunAt: async () => NOW - 15 * 60_000 });
    await runBackgroundJob(d);
    expect(calls).toEqual(['bootstrap', 'nudge']);
  });

  it('a failing sync does not skip the nudge nor fail the job', async () => {
    const { calls, deps: d } = deps({
      sync: async () => {
        throw new Error('boom');
      },
    });
    expect(await runBackgroundJob(d)).toBe('success');
    expect(calls).toContain('nudge');
  });

  it('fails only when the database cannot open', async () => {
    const { calls, deps: d } = deps({
      bootstrap: async () => {
        throw new Error('db');
      },
    });
    expect(await runBackgroundJob(d)).toBe('failed');
    expect(calls).toEqual([]);
  });
});

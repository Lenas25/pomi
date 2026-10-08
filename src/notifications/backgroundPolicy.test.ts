import {
  HEAVY_INTERVAL_MS,
  HEAVY_SLACK_MS,
  intervalFor,
  isHeavyDue,
  runBackgroundJob,
  shouldRegister,
  type HeavyRetries,
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
    expect(isHeavyDue(NOW - HEAVY_INTERVAL_MS + HEAVY_SLACK_MS + 1, NOW)).toBe(false);
    expect(isHeavyDue(NOW - HEAVY_INTERVAL_MS + HEAVY_SLACK_MS, NOW)).toBe(true);
    // A wake that drifted 10 minutes early still counts as due.
    expect(isHeavyDue(NOW - HEAVY_INTERVAL_MS + 10 * 60_000, NOW)).toBe(true);
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

  it('a failing sync still runs the nudge, rewinds the stamp and fails the job', async () => {
    const stamps: number[] = [];
    const { calls, deps: d } = deps({
      lastHeavyRunAt: async () => NOW - HEAVY_INTERVAL_MS - 1,
      saveHeavyRunAt: async (ms) => {
        stamps.push(ms);
      },
      sync: async () => {
        throw new Error('boom');
      },
    });
    expect(await runBackgroundJob(d)).toBe('failed');
    expect(calls).toContain('nudge');
    expect(stamps).toEqual([NOW, NOW - HEAVY_INTERVAL_MS - 1]);
  });

  it('rewinds the stamp at most twice per 6 h window, then waits the normal interval', async () => {
    const stamps: number[] = [];
    let retries: HeavyRetries | undefined;
    const failing = (at: number) =>
      deps({
        now: () => new Date(at),
        lastHeavyRunAt: async () => stamps.at(-1) ?? undefined,
        saveHeavyRunAt: async (ms) => {
          stamps.push(ms);
        },
        heavyRetries: async () => retries,
        saveHeavyRetries: async (value) => {
          retries = value;
        },
        sync: async () => {
          throw new Error('boom');
        },
      }).deps;
    await runBackgroundJob(failing(NOW)); // stamp NOW, rewind 1
    await runBackgroundJob(failing(NOW + 15 * 60_000)); // due again (rewound to 0), rewind 2
    expect(retries).toEqual({ windowStart: NOW, count: 2 });
    stamps.length = 0;
    await runBackgroundJob(failing(NOW + 30 * 60_000)); // stamp kept: no third rewind
    expect(stamps).toEqual([NOW + 30 * 60_000]);
    expect(isHeavyDue(stamps[0], NOW + 45 * 60_000)).toBe(false);
    // A new window gets a new budget.
    await runBackgroundJob(failing(NOW + HEAVY_INTERVAL_MS + 31 * 60_000));
    expect(retries).toEqual({ windowStart: NOW + HEAVY_INTERVAL_MS + 31 * 60_000, count: 1 });
  });

  it('a failed first sync rewinds the stamp to 0 so it is due again', async () => {
    const stamps: number[] = [];
    const { deps: d } = deps({
      saveHeavyRunAt: async (ms) => {
        stamps.push(ms);
      },
      sync: async () => {
        throw new Error('boom');
      },
    });
    await runBackgroundJob(d);
    expect(stamps).toEqual([NOW, 0]);
    expect(isHeavyDue(0, NOW)).toBe(true);
  });

  it('runs the permission check after the nudge and isolates its failure', async () => {
    const { calls, deps: d } = deps({
      permissionCheck: async () => {
        calls.push('permission');
        throw new Error('x');
      },
    });
    expect(await runBackgroundJob(d)).toBe('success');
    expect(calls.slice(-2)).toEqual(['nudge', 'permission']);
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

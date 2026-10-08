import { describe, expect, it, jest } from '@jest/globals';

import { loadDefaultTemplates } from '../templates/defaults';
import type { UpcomingState } from '../domain/notifications/buildUpcoming';
import type { ScheduledEntry } from '../domain/notifications/diff';
import { es } from '../i18n/es';
import { en } from '../i18n/en';
import type { Translate } from '../i18n';

import type { NotificationPlan } from './loadState';
import type { SchedulerApi } from './reconcile';
import type { ResolvedPlanned } from './resolve';
import { runSync, type SyncDeps } from './runSync';

const defaults = loadDefaultTemplates();
const NOW = new Date(2026, 9, 5, 7, 0); // Monday 07:00

function plan(overrides: Partial<NotificationPlan> = {}): NotificationPlan {
  const state: UpcomingState = {
    profile: { weightKg: 60, workType: 'sentada' },
    anchors: defaults.settings.anchors ?? {},
    gymDays: defaults.settings.gymDays ?? [],
    modules: defaults.modules,
    today: {
      activityLogged: false,
      gymDone: false,
      checkinsDone: { morning: false, night: false },
      doneAgendaIds: [],
    },
  };
  return { enabled: true, state, ...overrides };
}

function lookup(messages: Record<string, unknown>, key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    );
  return typeof value === 'string' ? value : key;
}

function translator(messages: Record<string, unknown>): Translate {
  return (key, options) =>
    lookup(messages, key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(options?.[name] ?? ''),
    );
}

/** An in-memory OS scheduler. */
function fakeOs(initial: ScheduledEntry[] = []) {
  const store = new Map(initial.map((entry) => [entry.id, entry.signature]));
  const api: SchedulerApi<ResolvedPlanned> = {
    list: async () => [...store].map(([id, signature]) => ({ id, signature })),
    schedule: jest.fn(async (notification: ResolvedPlanned, signature: string) => {
      store.set(notification.id, signature);
    }),
    cancel: jest.fn(async (id: string) => {
      store.delete(id);
    }),
  };
  return { store, api };
}

function deps(os: ReturnType<typeof fakeOs>, overrides: Partial<SyncDeps> = {}): SyncDeps {
  return {
    now: () => NOW,
    loadPlan: async () => plan(),
    canNotify: async () => true,
    prepare: jest.fn(async () => undefined),
    api: os.api,
    t: translator(es),
    ...overrides,
  };
}

describe('runSync', () => {
  it('schedules the whole window and prepares channels and categories first', async () => {
    const os = fakeOs();
    const d = deps(os);
    const result = await runSync(d);
    expect(result.skipped).toBeNull();
    expect(result.scheduled).toBeGreaterThan(20);
    expect(result.scheduled).toBeLessThanOrEqual(64);
    expect(os.store.size).toBe(result.scheduled);
    expect(d.prepare).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: a second run changes nothing', async () => {
    const os = fakeOs();
    await runSync(deps(os));
    const second = await runSync(deps(os));
    expect(second).toMatchObject({ scheduled: 0, cancelled: 0, failed: 0 });
  });

  it('cancels what is no longer wanted (e.g. today survey after answering) and schedules the rest', async () => {
    const os = fakeOs();
    await runSync(deps(os));
    expect(os.store.has('survey:core:activity:2026-10-05:20:10')).toBe(true);

    const answered = plan();
    answered.state.today.activityLogged = true;
    const result = await runSync(deps(os, { loadPlan: async () => answered }));
    expect(result.cancelled).toBeGreaterThan(0);
    expect(os.store.has('survey:core:activity:2026-10-05:20:10')).toBe(false);
    expect(os.store.has('survey:core:activity:2026-10-06:20:10')).toBe(true);
  });

  it('never cancels notifications it does not own (timers, snoozes)', async () => {
    const os = fakeOs([
      { id: '5b6c0f4e-1111-2222-3333-444455556666', signature: undefined },
      { id: 'snooze:water:agua:agua:2026-10-05:10:00:99', signature: undefined },
    ]);
    await runSync(deps(os));
    expect(os.store.has('5b6c0f4e-1111-2222-3333-444455556666')).toBe(true);
    expect(os.store.has('snooze:water:agua:agua:2026-10-05:10:00:99')).toBe(true);
  });

  it('reschedules everything when the language changes (texts are part of the signature)', async () => {
    const os = fakeOs();
    const first = await runSync(deps(os));
    const second = await runSync(deps(os, { t: translator(en) }));
    expect(second.scheduled).toBeGreaterThan(0);
    expect(second.scheduled).toBeLessThanOrEqual(first.scheduled);
    expect(os.store.size).toBe(first.scheduled);
  });

  it('removes everything of ours when alerts are switched off or the onboarding is not done', async () => {
    const os = fakeOs();
    await runSync(deps(os));
    const result = await runSync(deps(os, { loadPlan: async () => plan({ enabled: false }) }));
    expect(result.skipped).toBe('disabled');
    expect(os.store.size).toBe(0);
  });

  it('does nothing without notification permission', async () => {
    const os = fakeOs();
    const d = deps(os, { canNotify: async () => false });
    const result = await runSync(d);
    expect(result.skipped).toBe('no-permission');
    expect(os.store.size).toBe(0);
    expect(d.prepare).not.toHaveBeenCalled();
  });

  it('keeps going when the OS refuses one notification', async () => {
    const os = fakeOs();
    let calls = 0;
    (os.api.schedule as jest.Mock<SchedulerApi<ResolvedPlanned>['schedule']>).mockImplementation(
      async (notification, signature) => {
        calls += 1;
        if (calls === 1) throw new Error('alarm limit');
        os.store.set(notification.id, signature);
      },
    );
    const result = await runSync(deps(os));
    expect(result.failed).toBe(1);
    expect(result.scheduled).toBeGreaterThan(10);
  });
});

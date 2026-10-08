import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { buildTimeline, type TimelineEntry } from '../domain/today/timeline';
import { loadDefaultTemplates } from '../templates/defaults';

import { markDone, postpone, skipToday, type TodayActionDeps } from './todayActions';
import { loadTodayData } from './todayData';
import { emptyTodayState, progressFrom, todayStateFor, type TodayState } from './todayView';

let repos: Repositories;
let close: () => void;

// Monday 2026-10-05, 10:00.
const NOW = new Date(2026, 9, 5, 10, 0);
const TODAY = '2026-10-05';

beforeEach(async () => {
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db);
  const defaults = loadDefaultTemplates();
  await repos.templates.saveModules(defaults.modules, 'add');
  await repos.settings.set('anchors', defaults.settings.anchors ?? {});
  await repos.settings.set('gymDays', defaults.settings.gymDays ?? []);
  await repos.settings.set('startedOn', '2026-09-01');
  await repos.settings.set('userName', 'Lena');
  await repos.profile.save({ weightKg: 60, workType: 'sentada' });
});

afterEach(() => close());

describe('loadTodayData', () => {
  it("treats 00:30 as the end of the previous day and reads that day's logs", async () => {
    await repos.activity.upsert(TODAY, 'walk', 'manual');
    const late = await loadTodayData(repos, new Date(2026, 9, 6, 0, 30));
    expect(late.today).toBe(TODAY);
    expect(late.activityToday).toBe('walk');
    expect(late.midnight.getTime()).toBe(new Date(2026, 9, 5).getTime());
    const morning = await loadTodayData(repos, new Date(2026, 9, 6, 4, 0));
    expect(morning.today).toBe('2026-10-06');
    expect(morning.activityToday).toBeUndefined();
  });

  it("loads the goal of the first main exercise of today's routine", async () => {
    const data = await loadTodayData(repos, NOW);
    expect(data.gymGoal?.exercise).toBeTruthy();
    expect(data.gymGoal?.message.key).toMatch(/^gym\.(target|session)\./);
  });

  it('builds the agenda of the day with the routine, the name and nothing done yet', async () => {
    const data = await loadTodayData(repos, NOW);
    expect(data.today).toBe(TODAY);
    expect(data.userName).toBe('Lena');
    expect(data.agenda.map((item) => item.id)).toContain('gym');
    expect(data.routineName).toBeDefined();
    expect(data.facts.gymDone).toBe(false);
    expect(data.activityToday).toBeUndefined();
    expect(data.identity.firstDay).toBe(false);
    const entries = buildTimeline(
      data.agenda,
      600,
      progressFrom(data.agenda, data.facts, data.state, data.midnight),
    );
    expect(entries.every((entry) => entry.status !== 'done')).toBe(true);
  });

  it('shows what is really done: gym session, water goal, check-in, activity answer', async () => {
    const session = await repos.workouts.createSession({
      programId: 'p',
      routineId: 'r',
      date: TODAY,
      startedAt: NOW.getTime() - 3_600_000,
    });
    await repos.workouts.logSet({
      sessionId: session,
      stepId: 's',
      setIndex: 0,
      reps: 8,
      doneAt: 1,
    });
    await repos.workouts.finishSession(session, NOW.getTime() - 60_000);
    await repos.habitLogs.set('agua', TODAY, 20);
    await repos.checkins.upsert(TODAY, 'morning', {});
    await repos.activity.upsert(TODAY, 'gym', 'notification');

    const data = await loadTodayData(repos, NOW);
    const entries = buildTimeline(
      data.agenda,
      600,
      progressFrom(data.agenda, data.facts, data.state, data.midnight),
    );
    const status = (id: string) => entries.find((entry) => entry.id === id)?.status;
    expect(status('gym')).toBe('done');
    expect(status('water:agua:agua')).toBe('done');
    expect(status('checkin:morning')).toBe('done');
    expect(status('checkin:night')).not.toBe('done');
    expect(data.activityToday).toBe('gym');
    expect(data.identity.gymDates).toEqual([TODAY]);
  });

  it('flags the first day (onboarding finished today) and ignores a stored state of another day', async () => {
    await repos.settings.set('startedOn', TODAY);
    await repos.settings.set('todayState', {
      date: '2026-10-04',
      skipped: ['gym'],
      acked: [],
      snoozed: {},
    });
    const data = await loadTodayData(repos, NOW);
    expect(data.identity.firstDay).toBe(true);
    expect(data.state).toEqual(emptyTodayState(TODAY));
  });
});

// --- Row actions -------------------------------------------------------------------------------

describe('timeline actions', () => {
  let state: TodayState;
  const logCheck = jest.fn<TodayActionDeps['logCheck']>();
  const addWater = jest.fn<TodayActionDeps['addWater']>();
  const scheduleSnooze = jest.fn<TodayActionDeps['scheduleSnooze']>();
  let deps: TodayActionDeps;
  let entries: TimelineEntry[];

  beforeEach(async () => {
    jest.resetAllMocks();
    logCheck.mockResolvedValue(undefined);
    addWater.mockResolvedValue(undefined);
    scheduleSnooze.mockResolvedValue(undefined);
    state = emptyTodayState(TODAY);
    deps = {
      today: TODAY,
      now: () => NOW.getTime(),
      state: async () => state,
      saveState: async (next) => {
        state = next;
      },
      logCheck,
      addWater,
      scheduleSnooze,
    };
    const data = await loadTodayData(repos, NOW);
    entries = buildTimeline(
      data.agenda,
      600,
      progressFrom(data.agenda, data.facts, data.state, data.midnight),
    );
  });

  const entry = (id: string) => {
    const found = entries.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`missing ${id}`);
    return found;
  };

  it('swipe right on a check logs it; on water adds one glass; on a reminder acknowledges it', async () => {
    await markDone(entry('habit:movimiento:caminar-comida'), deps);
    expect(logCheck).toHaveBeenCalledWith('caminar-comida', TODAY);
    await markDone(entry('water:agua:agua'), deps);
    expect(addWater).toHaveBeenCalledWith('agua', TODAY);
    await markDone(entry('reminder:sueno:dormir'), deps);
    expect(state.acked).toEqual(['reminder:sueno:dormir']);
  });

  it('things that need real input navigate instead of faking completion', async () => {
    expect(await markDone(entry('gym'), deps)).toEqual({ type: 'navigate', target: 'gym' });
    expect(await markDone(entry('checkin:morning'), deps)).toEqual({
      type: 'navigate',
      target: 'checkin:morning',
    });
    expect(logCheck).not.toHaveBeenCalled();
  });

  it('long press > Posponer 10 min: stores +10 min, schedules a reminder and shows the new time', async () => {
    await postpone(entry('gym'), deps);
    const at = NOW.getTime() + 10 * 60_000;
    expect(state.snoozed).toEqual({ gym: at });
    expect(scheduleSnooze).toHaveBeenCalledWith(expect.objectContaining({ id: 'gym' }), at);

    const data = await loadTodayData(repos, NOW);
    const shown = buildTimeline(
      data.agenda,
      600,
      progressFrom(data.agenda, data.facts, state, data.midnight),
    ).find((candidate) => candidate.id === 'gym');
    expect(shown?.minutes).toBe(610);
    expect(shown?.status).toBe('upcoming');
  });

  it('a failing reminder does not undo the postponement', async () => {
    scheduleSnooze.mockRejectedValueOnce(new Error('no permission'));
    await postpone(entry('gym'), deps);
    expect(state.snoozed.gym).toBeDefined();
  });

  it('long press > Omitir hoy: skipped (neutral) and the postponement is dropped', async () => {
    await postpone(entry('gym'), deps);
    await skipToday(entry('gym'), deps);
    expect(state.skipped).toEqual(['gym']);
    expect(state.snoozed).toEqual({});
    const progress = progressFrom(
      [],
      { gymDone: false, view: (await loadTodayData(repos, NOW)).facts.view },
      state,
      NOW,
    );
    expect(progress.skippedIds.has('gym')).toBe(true);
  });

  it('todayStateFor keeps the stored state of today only', () => {
    const stored = { ...emptyTodayState(TODAY), skipped: ['gym'] };
    expect(todayStateFor(stored, TODAY)).toBe(stored);
    expect(todayStateFor(stored, '2026-10-06')).toEqual(emptyTodayState('2026-10-06'));
    expect(todayStateFor(undefined, TODAY)).toEqual(emptyTodayState(TODAY));
  });
});

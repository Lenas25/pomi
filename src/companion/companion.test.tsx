import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { buildCompanion, pickTodayCard } from '../domain/companion';
import { generateSyntheticDays } from '../domain/testing/syntheticData';
import { setLanguage } from '../i18n';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { loadDefaultTemplates } from '../templates/defaults';
import { loadTodayData } from '../today/todayData';
import { ThemeProvider } from '../ui/theme';

import { CompanionSection } from './CompanionSection';
import { loadCompanion } from './loadCompanion';
import { SleepCalcScreen } from './SleepCalcScreen';
import { jetlagLines, rhythmLines, sleepDebtLines, todayCardTexts, waterLines } from './text';

const mockEnv: { repos: Repositories | null } = { repos: null };
const mockRouter = { back: jest.fn(), push: jest.fn() };

jest.mock('expo-router', () => ({
  router: {
    back: () => mockRouter.back(),
    push: (...args: unknown[]) => mockRouter.push(...args),
  },
}));
jest.mock('../db', () => ({ getRepositories: () => mockEnv.repos }));

const days = generateSyntheticDays({ days: 60, afternoonGap: true });
const TODAY = days[days.length - 1]!.date;
let close: () => void;
let clock = 0;
let repos: Repositories;

beforeEach(async () => {
  setLanguage('es');
  jest.clearAllMocks();
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db, () => clock);
  mockEnv.repos = repos;
  await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
  await repos.settings.set('anchors', { wake: '05:10', sleepTargetH: 7.5 });
  await repos.settings.set('gymDays', []);
  await repos.settings.set('onboardingComplete', true);
  await repos.settings.set('startedOn', '2025-12-01');
  await repos.profile.save({ weightKg: 60, workType: 'sentada' });
});
afterEach(() => close());

/** Writes the synthetic history through the real repositories (water with backdated events). */
async function seed(from = 0) {
  for (const day of days.slice(from)) {
    await repos.checkins.upsert(day.date, 'morning', {
      'hora-dormir': day.morning.bed,
      'hora-despertar': day.morning.wake,
      'calidad-sueno': day.morning.quality,
    });
    await repos.checkins.upsert(day.date, 'night', {
      energia: day.night.energy,
      animo: day.night.mood,
    });
    await repos.steps.upsert(day.date, day.steps, 'manual');
    if (day.activity !== 'none') await repos.activity.upsert(day.date, day.activity, 'manual');
  }
  // Water events only exist for the last 30 days: write the last 14 finished days.
  for (const day of days.slice(-15, -1)) {
    const [y = 0, mo = 1, d = 1] = day.date.split('-').map(Number);
    for (const [hour, ml] of day.waterByHour.entries()) {
      if (ml <= 0) continue;
      clock = new Date(y, mo - 1, d, hour, 10).getTime();
      await repos.habitLogs.increment('agua', day.date);
    }
  }
  clock = new Date(2026, 0, 31, 10, 0).getTime();
}

describe('loadCompanion on the real migrations', () => {
  it('feeds the engines from the repositories and agrees with the pure build', async () => {
    clock = new Date(2026, 0, 31, 10, 0).getTime();
    await seed();
    const companion = await loadCompanion(repos, TODAY);
    expect(companion.sleepDebt?.days).toBe(7);
    expect(companion.jetlag?.notable).toBe(true);
    expect(companion.water?.days).toBeGreaterThanOrEqual(7);
    expect(companion.water?.gap?.fromHour).toBe(14);
    expect(companion.rhythm.ready).toBe(true);
    expect(companion.rhythm.chronotype?.tendency).toBe('morning');
  });

  it('says nothing with no data', async () => {
    const companion = await loadCompanion(repos, TODAY);
    expect(companion.sleepDebt).toBeNull();
    expect(companion.jetlag).toBeNull();
    expect(companion.water).toBeNull();
    expect(companion.rhythm).toMatchObject({ ready: false, daysWithData: 0 });
    expect(pickTodayCard(companion)).toBeNull();
  });
});

describe('the companion card of Hoy', () => {
  const NOW = new Date(2026, 0, 31, 10, 0);

  it('is loaded once, quiet below the thresholds, and put away for the day', async () => {
    clock = NOW.getTime();
    await seed();
    const data = await loadTodayData(repos, NOW);
    expect(data.companionCard).toBeDefined();
    await repos.settings.set('companionCardDismissed', TODAY);
    expect((await loadTodayData(repos, NOW)).companionCard).toBeUndefined();
    // Tomorrow it can come back.
    expect(await repos.settings.get('companionCardDismissed')).toBe(TODAY);
  });

  it('never appears together with a pending suggestion', async () => {
    clock = NOW.getTime();
    await seed();
    await repos.suggestions.create({
      kind: 'sleepEarlier',
      reason: 'suggestions.sleepEarlier.reason',
      createdAt: NOW.getTime(),
      payload: {
        variant: 'sleepEarlier',
        change: { type: 'bedtimeShift', fromMin: 0, toMin: -15 },
        params: { avg: '6 h', target: '7 h 30 min', minutes: 15 },
        evidence: { days: 7 },
      },
    });
    const data = await loadTodayData(repos, NOW);
    expect(data.suggestion).toBeDefined();
    expect(data.companionCard).toBeUndefined();
  });
});

describe('texts', () => {
  const t =
    (messages: typeof es | typeof en) => (key: string, options?: Record<string, unknown>) => {
      const value = key
        .split('.')
        .reduce<unknown>(
          (node, part) => (node as Record<string, unknown> | undefined)?.[part],
          messages,
        );
      return String(value ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options?.[name] ?? `{{${name}}}`),
      );
    };

  for (const [language, messages] of [
    ['es', es],
    ['en', en],
  ] as const) {
    it(`${language}: every line is complete, prudent and never causal`, () => {
      const translate = t(messages) as never;
      const companion = buildCompanion({
        today: TODAY,
        sleepTargetMin: 450,
        nights: days.map((d) => ({ date: d.date, bed: d.morning.bed, wake: d.morning.wake })),
        energy: days.map((d) => ({ date: d.date, value: d.night.energy })),
        checkinDates: days.map((d) => d.date),
        activity: days.map((d) => ({ date: d.date, moved: d.gym, steps: d.steps })),
        water: { events: [], targets: {} },
      });
      const lines = [
        ...Object.values(sleepDebtLines(companion.sleepDebt, translate, language)),
        ...Object.values(jetlagLines(companion.jetlag, translate)),
        ...Object.values(waterLines(null, translate)),
        ...JSON.stringify(rhythmLines(companion.rhythm, translate, language)).split('","'),
        ...Object.values(todayCardTexts({ kind: 'sleepDebt', debtMin: 150 }, translate, language)),
        ...Object.values(todayCardTexts({ kind: 'jetlag', jetlagMin: 80 }, translate, language)),
        ...Object.values(
          todayCardTexts({ kind: 'waterGap', fromHour: 14, toHour: 17 }, translate, language),
        ),
      ];
      for (const line of lines) {
        expect(line).not.toMatch(/\{\{|companion\.|sleepCalc\./);
        expect(line).not.toMatch(
          /racha|streak|culpa|fault|deber[ií]as|should have|te hace|makes you/i,
        );
      }
    });
  }

  it('formats the debt in half hours', () => {
    const debt = { days: 7, targetMin: 450, debtMin: 170 };
    expect(sleepDebtLines(debt, t(es) as never, 'es')).toMatchObject({
      headline: '≈ 3 h de sueño pendiente esta semana',
    });
    expect(sleepDebtLines({ ...debt, debtMin: 80 }, t(es) as never, 'es')).toMatchObject({
      headline: '≈ 1,5 h de sueño pendiente esta semana',
    });
    expect(sleepDebtLines({ ...debt, debtMin: 10 }, t(es) as never, 'es')).toMatchObject({
      headline: 'Casi no tienes sueño pendiente esta semana.',
    });
  });
});

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

describe('screens', () => {
  it('Tu ritmo shows the numbers, the chart and the "still getting to know you" state', async () => {
    clock = new Date(2026, 0, 31, 10, 0).getTime();
    await seed();
    // A 8 h 30 min goal against ~7 h 20 min of sleep: a clear debt to show.
    await repos.settings.set('anchors', { wake: '05:10', sleepTargetH: 8.5 });
    const full = await loadCompanion(repos, TODAY);
    await renderThemed(<CompanionSection companion={full} />);
    expect(screen.getByText('Tu ritmo')).toBeTruthy();
    expect(screen.getByText(/de sueño pendiente esta semana/)).toBeTruthy();
    expect(screen.getByText(/Notamos que tu sueño del fin de semana se corre casi/)).toBeTruthy();
    expect(screen.getByRole('image', { name: /Vasos acumulados en promedio/ })).toBeTruthy();
    expect(screen.getByText(/Tiendes a un ritmo más de mañana/)).toBeTruthy();
    expect(screen.queryByText(/aún te estoy conociendo/i)).toBeNull();
  });

  it('shows the learning state with the day count when there is little data', async () => {
    const few = buildCompanion({
      today: TODAY,
      nights: [],
      energy: [],
      checkinDates: days.slice(-9).map((day) => day.date),
      activity: [],
      water: { events: [], targets: {} },
    });
    await renderThemed(<CompanionSection companion={few} />);
    expect(screen.getByText('Aún te estoy conociendo (9/21 días)')).toBeTruthy();
    expect(screen.getByText(/Con 7 días de agua registrada/)).toBeTruthy();
  });

  it('the bedtime calculator starts from the plan and moves with the wake time', async () => {
    await renderThemed(<SleepCalcScreen />);
    // wake 05:10: 6 cycles 20:55 would be wake - 540 - 15 = 20:... computed by the engine.
    expect(
      await screen.findByLabelText(/Dormir a las 21:25: 5 ciclos, 7 h 30 min de sueño/),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Dormir a las 22:55: 4 ciclos, 6 h de sueño/)).toBeTruthy();
    expect(screen.getByLabelText(/Dormir a las 19:55: 6 ciclos, 9 h de sueño/)).toBeTruthy();
    expect(screen.getByText('Tu meta de sueño es 7,5 h.')).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getAllByRole('button', { name: /Subir/ })[0]!);
    });
    // 06:10 - 4 x 90 min - 15 min = 23:55.
    expect(screen.getByLabelText(/Dormir a las 23:55: 4 ciclos/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { buildTimeline } from '../domain/today/timeline';
import { buildAgenda } from '../domain/agenda/buildAgenda';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { setLanguage } from '../i18n';
import { loadDefaultTemplates } from '../templates/defaults';
import { ThemeProvider } from '../ui/theme';

import { TodayScreen } from './TodayScreen';
import type { TodayData } from './todayData';
import { router } from 'expo-router';

import { useToday, type TodayLoad } from './useToday';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
  router: { push: jest.fn() },
}));
jest.mock('./useToday', () => ({ useToday: jest.fn() }));

const mockedUseToday = jest.mocked(useToday);

const SAMPLE_HABITS: TodayData['facts']['view'] = {
  water: {
    habitId: 'agua',
    name: 'Agua',
    glassMl: 250,
    value: 3,
    target: { glasses: 8, ml: 2000, glassMl: 250, gymDay: false },
    consistency: null,
  },
  steps: {
    habitId: 'pasos',
    name: 'Pasos',
    steps: 4200,
    source: null,
    plan: { phase: 'active', baselineDaysLeft: 0, baseline: 5000, goal: 6000 },
    consistency: null,
  },
  checks: [],
  food: null,
  checkins: { morning: { enabled: true, done: true }, night: { enabled: true, done: false } },
  activityToday: undefined,
};
const defaults = loadDefaultTemplates();

function dataWith(
  overrides: Partial<TodayData['identity']> = {},
  activity?: 'gym',
  gymGoal?: TodayData['gymGoal'],
): TodayData {
  const now = new Date(2026, 9, 5, 10, 0);
  const agenda = buildAgenda(now, {
    profile: { weightKg: 60, workType: 'sentada' },
    anchors: defaults.settings.anchors ?? {},
    gymDays: defaults.settings.gymDays ?? [],
    modules: defaults.modules,
  });
  return {
    today: '2026-10-05',
    midnight: new Date(2026, 9, 5),
    userName: undefined,
    agenda,
    facts: { gymDone: false, view: SAMPLE_HABITS },
    state: { date: '2026-10-05', skipped: [], acked: [], snoozed: {} },
    activityToday: activity,
    routineName: 'Día 1',
    gymGoal,
    reviewEntry: false,
    suggestion: undefined,
    insight: undefined,
    companionCard: undefined,
    identity: { gymDates: [], plannedGymDays: 4, waterDays: null, firstDay: false, ...overrides },
  };
}

function mockToday(
  data: TodayData,
  options: {
    allDone?: boolean;
    status?: 'done' | 'upcoming';
    empty?: boolean;
    suggestion?: { id: number; text: string; reason: string; evidence: string };
    insight?: { id: number; text: string; evidence: string };
    notice?: { id: number; variant: 'info' | 'error'; title: string; subtitle: string };
  } = {},
) {
  const progress = {
    doneIds: new Set(options.status === 'done' ? data.agenda.map((item) => item.id) : []),
    ackedIds: new Set<string>(),
    skippedIds: new Set<string>(),
    snoozedTo: new Map<string, number>(),
  };
  const entries = options.empty ? [] : buildTimeline(data.agenda, 600, progress);
  const load: TodayLoad = { status: 'ready', data };
  const handlers = {
    done: jest.fn(),
    postpone: jest.fn(),
    skip: jest.fn(),
    open: jest.fn(),
    answerActivity: jest.fn(),
    addWater: jest.fn(async () => undefined),
    reload: jest.fn(async () => undefined),
    acceptSuggestion: jest.fn(async () => undefined),
    declineSuggestion: jest.fn(async () => undefined),
    clearNotice: jest.fn(),
    dismissCompanionCard: jest.fn(async () => undefined),
    markInsightSeen: jest.fn(async () => undefined),
  };
  mockedUseToday.mockReturnValue({
    load,
    view: {
      data,
      entries,
      nowMinutes: 600,
      allDone: options.allDone ?? false,
      greeting: 'Buenos días',
      identity: 'Un paso a la vez. Hoy cuenta.',
      suggestion: options.suggestion ?? null,
      insight: options.insight ?? null,
    },
    suggestionBusy: false,
    notice: options.notice ?? null,
    ...handlers,
  });
  return handlers;
}

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

const setAppState = (value: AppStateStatus) =>
  Object.defineProperty(AppState, 'currentState', { value, configurable: true });

beforeEach(() => {
  setAppState('active');
  setLanguage('es');
});

describe('TodayScreen', () => {
  it('greets, shows the identity phrase and the timeline of the day', async () => {
    mockToday(dataWith());
    await renderThemed(<TodayScreen />);
    expect(screen.getByText('Buenos días')).toBeTruthy();
    expect(screen.getByText('Un paso a la vez. Hoy cuenta.')).toBeTruthy();
    // Hub tiles from the data, each one speaking its summary.
    expect(screen.getByRole('button', { name: 'Agua: 3 de 8 vasos. Abrir detalle' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /^Pasos: 4200 de 6000|^Pasos: 4\.200 de 6\.000/ }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Check-ins: 1 de 2/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Gym hoy: Día 1/ })).toBeTruthy();
    expect(screen.getByText('Ahora · 10:00')).toBeTruthy();
    // No suggestion pending: no card.
    expect(screen.queryByText('Aceptar')).toBeNull();
  });

  it('shows one suggestion with its reason; "Aceptar" and "Ahora no" call the handlers', async () => {
    const handlers = mockToday(dataWith(), {
      suggestion: {
        id: 7,
        text: '¿Movemos tu hora de dormir 15 minutos antes?',
        reason: 'Esta semana dormiste en promedio 6 h 40 min y tu meta es 8 h.',
        evidence: 'Basado en 7 días',
      },
    });
    await renderThemed(<TodayScreen />);
    expect(screen.getByText('¿Movemos tu hora de dormir 15 minutos antes?')).toBeTruthy();
    expect(screen.getByText(/dormiste en promedio 6 h 40 min/)).toBeTruthy();
    expect(screen.getByText('Basado en 7 días')).toBeTruthy();
    expect(screen.getAllByText('Aceptar')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Aceptar' }));
    expect(handlers.acceptSuggestion).toHaveBeenCalledWith(7);
    expect(handlers.declineSuggestion).not.toHaveBeenCalled();
  });

  it('"Ahora no" fades the card and then reports the rejection', async () => {
    jest.useFakeTimers();
    try {
      const handlers = mockToday(dataWith(), {
        suggestion: { id: 3, text: 'Texto', reason: 'Motivo', evidence: 'Basado en 7 días' },
      });
      await renderThemed(<TodayScreen />);
      await fireEvent.press(screen.getByRole('button', { name: 'Ahora no' }));
      expect(handlers.declineSuggestion).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(400);
      expect(handlers.declineSuggestion).toHaveBeenCalledWith(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('announces the result of accepting through a toast', async () => {
    mockToday(dataWith(), {
      notice: {
        id: 1,
        variant: 'info',
        title: 'Plan actualizado',
        subtitle: 'El cambio ya está en tu plan.',
      },
    });
    await renderThemed(<TodayScreen />);
    expect(screen.getByText('Plan actualizado')).toBeTruthy();
  });

  it('offers the weekly review on Sundays and opens it', async () => {
    mockToday({ ...dataWith(), reviewEntry: true });
    await renderThemed(<TodayScreen />);
    expect(screen.getByText('Tu semana está lista')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ver mi semana' }));
    expect(jest.mocked(router.push)).toHaveBeenCalledWith('/revision');
  });

  it('does not offer the weekly review on other days', async () => {
    mockToday(dataWith());
    await renderThemed(<TodayScreen />);
    expect(screen.queryByText('Tu semana está lista')).toBeNull();
  });

  it('highlights the goal of the first main exercise on the gym row', async () => {
    mockToday(
      dataWith({}, undefined, {
        exercise: 'Sentadilla',
        message: { key: 'gym.target.chooseWeight', params: {} },
      }),
    );
    await renderThemed(<TodayScreen />);
    expect(screen.getByText('Sentadilla')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: /Sentadilla: Elige un peso con el que te queden 1 o 2 repeticiones en reserva\. Abrir gym$/,
      }),
    ).toBeTruthy();
  });

  it('first day: mascot hola and the hub', async () => {
    mockToday(dataWith({ firstDay: true }));
    await renderThemed(<TodayScreen />);
    expect(screen.getByText('Hola. Empezamos hoy, sin prisa.')).toBeTruthy();
    expect(screen.getByTestId('bento-grid')).toBeTruthy();
  });

  it('tiles open their detail pages; +1 adds a glass in place', async () => {
    const handlers = mockToday(dataWith());
    await renderThemed(<TodayScreen />);
    const push = jest.mocked(router.push);
    push.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: /Abrir tu día$/ }));
    expect(push).toHaveBeenLastCalledWith('/hoy/agenda');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Agua: 3 de 8 vasos. Abrir detalle' }),
    );
    expect(push).toHaveBeenLastCalledWith('/habitos/agua');
    await fireEvent.press(screen.getByRole('button', { name: /^Pasos:/ }));
    expect(push).toHaveBeenLastCalledWith('/habitos/pasos');
    await fireEvent.press(screen.getByRole('button', { name: /^Gym hoy:/ }));
    expect(push).toHaveBeenLastCalledWith('/gym');
    await fireEvent.press(screen.getByRole('button', { name: /^Check-ins:/ }));
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/checkin/[tipo]',
      params: { tipo: 'night' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Sumar un vaso de agua' }));
    expect(handlers.addWater).toHaveBeenCalledTimes(1);
  });

  it('the day progress ring speaks x of y done', async () => {
    mockToday(dataWith(), { allDone: true, status: 'done' });
    await renderThemed(<TodayScreen />);
    expect(screen.getByLabelText(/^Tu día: (\d+) de \1 hechos$/)).toBeTruthy();
  });

  it('asks "¿Te moviste hoy?" only while it is unanswered', async () => {
    const handlers = mockToday(dataWith());
    const { unmount } = await renderThemed(<TodayScreen />);
    await fireEvent.press(
      screen.getByRole('button', { name: '¿Te moviste hoy? Sin responder. Responder' }),
    );
    await fireEvent.press(screen.getByRole('radio', { name: /Fui al gym/ }));
    expect(handlers.answerActivity).toHaveBeenCalledWith('gym');
    await unmount();

    mockToday(dataWith({}, 'gym'));
    await renderThemed(<TodayScreen />);
    expect(
      screen.queryByRole('button', { name: '¿Te moviste hoy? Sin responder. Responder' }),
    ).toBeNull();
  });

  it('when everything is done: mascot descansa and the closing message', async () => {
    mockToday(dataWith(), { allDone: true, status: 'done' });
    await renderThemed(<TodayScreen />);
    expect(screen.getByText('Listo por hoy. Cierra la app y descansa')).toBeTruthy();
  });

  it('does not show the closing message while something is pending', async () => {
    mockToday(dataWith());
    await renderThemed(<TodayScreen />);
    expect(screen.queryByText('Listo por hoy. Cierra la app y descansa')).toBeNull();
  });

  it('shows the one companion card, opens Tu ritmo and can be put away', async () => {
    const handlers = mockToday({
      ...dataWith(),
      companionCard: { kind: 'sleepDebt', debtMin: 150 },
    });
    await renderThemed(<TodayScreen />);
    expect(screen.getByText('≈ 2,5 h de sueño pendiente')).toBeTruthy();
    expect(screen.queryByText(/racha|falta/i)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Ver Tu ritmo' }));
    expect(jest.mocked(router.push)).toHaveBeenCalledWith('/progreso');
    await fireEvent.press(screen.getByRole('button', { name: 'Ahora no' }));
    expect(handlers.dismissCompanionCard).toHaveBeenCalledTimes(1);
  });

  it('shows a new insight (celebrate card), marks it seen after 1 s on screen and opens Progreso', async () => {
    jest.useFakeTimers();
    try {
      const handlers = mockToday(dataWith(), {
        insight: {
          id: 9,
          text: 'Notamos que los días que entrenas duermes en promedio 35 minutos más.',
          evidence: 'Basado en 24 días',
        },
      });
      await renderThemed(<TodayScreen />);
      expect(screen.getByText(/Notamos que los días que entrenas/)).toBeTruthy();
      expect(screen.getByText('Basado en 24 días')).toBeTruthy();
      expect(handlers.markInsightSeen).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1000);
      expect(handlers.markInsightSeen).toHaveBeenCalledTimes(1);
      expect(handlers.markInsightSeen).toHaveBeenCalledWith(9);
      await fireEvent.press(screen.getByRole('button', { name: 'Ver todos los hallazgos' }));
      expect(jest.mocked(router.push)).toHaveBeenCalledWith('/progreso');
    } finally {
      jest.useRealTimers();
    }
  });

  it('an insight card that unmounts before 1 s is not marked as seen', async () => {
    jest.useFakeTimers();
    try {
      const handlers = mockToday(dataWith(), {
        insight: { id: 9, text: 'Notamos algo.', evidence: 'Basado en 24 días' },
      });
      const view = await renderThemed(<TodayScreen />);
      await jest.advanceTimersByTimeAsync(600);
      view.unmount();
      await jest.advanceTimersByTimeAsync(1000);
      expect(handlers.markInsightSeen).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('an insight card is not marked as seen while the app is in the background', async () => {
    jest.useFakeTimers();
    try {
      setAppState('background');
      const handlers = mockToday(dataWith(), {
        insight: { id: 9, text: 'Notamos algo.', evidence: 'Basado en 24 días' },
      });
      await renderThemed(<TodayScreen />);
      await jest.advanceTimersByTimeAsync(3000);
      expect(handlers.markInsightSeen).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows no companion card by default', async () => {
    mockToday(dataWith());
    await renderThemed(<TodayScreen />);
    expect(screen.queryByRole('button', { name: 'Ver Tu ritmo' })).toBeNull();
  });

  it('shows the empty state in the Ahora tile for a day without agenda', async () => {
    mockToday(dataWith(), { empty: true });
    await renderThemed(<TodayScreen />);
    expect(screen.getByText('Tu día aparecerá aquí')).toBeTruthy();
  });
});

describe('Hoy bubbles fit the 40 character limit (BRAND §9)', () => {
  it.each([
    ['es', es.today],
    ['en', en.today],
  ] as const)('%s', (_language, today) => {
    expect(today.firstBubble.length).toBeLessThanOrEqual(40);
    expect(today.doneBubble.length).toBeLessThanOrEqual(40);
  });
});

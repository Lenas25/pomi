import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { buildTimeline } from '../domain/today/timeline';
import { buildAgenda } from '../domain/agenda/buildAgenda';
import { weeklyItems } from '../domain/agenda/weekly';
import { setLanguage } from '../i18n';
import { loadDefaultTemplates } from '../templates/defaults';
import { ThemeProvider } from '../ui/theme';

import { AgendaScreen } from './AgendaScreen';
import type { TodayData } from './todayData';
import { router } from 'expo-router';

import { useToday, type TodayLoad } from './useToday';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
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
  const agendaState = {
    profile: { weightKg: 60, workType: 'sentada' },
    anchors: defaults.settings.anchors ?? {},
    gymDays: defaults.settings.gymDays ?? [],
    modules: defaults.modules,
  };
  const agenda = buildAgenda(now, agendaState);
  return {
    today: '2026-10-05',
    midnight: new Date(2026, 9, 5),
    userName: undefined,
    agenda,
    weekly: weeklyItems(now, agendaState),
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

describe('AgendaScreen (/hoy/agenda)', () => {
  it('lists the timeline of the day with the gym goal', async () => {
    mockToday(
      dataWith({}, undefined, {
        exercise: 'Sentadilla',
        message: { key: 'gym.target.chooseWeight', params: {} },
      }),
    );
    await renderThemed(<AgendaScreen />);
    expect(screen.getByText('Tu día')).toBeTruthy();
    expect(screen.getByText('Día 1')).toBeTruthy();
    expect(
      screen.getByText(
        'Sentadilla: Elige un peso con el que te queden 1 o 2 repeticiones en reserva.',
      ),
    ).toBeTruthy();
  });

  it('goes back from the header', async () => {
    mockToday(dataWith());
    await renderThemed(<AgendaScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(jest.mocked(router.back)).toHaveBeenCalledTimes(1);
  });

  it('long press opens the options with postpone and skip', async () => {
    const handlers = mockToday(dataWith());
    await renderThemed(<AgendaScreen />);
    await fireEvent(screen.getAllByRole('button', { name: /Gym/ })[0]!, 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Omitir hoy' }));
    expect(handlers.skip).toHaveBeenCalledTimes(1);
  });

  it('the bedtime row offers the sleep-cycle calculator', async () => {
    mockToday(dataWith());
    await renderThemed(<AgendaScreen />);
    await fireEvent(screen.getAllByRole('button', { name: /Hora de dormir/ })[0]!, 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Ver horas para dormir' }));
    expect(jest.mocked(router.push)).toHaveBeenCalledWith('/ciclos-sueno');
  });

  it('shows the closing message when everything is done', async () => {
    mockToday(dataWith(), { allDone: true, status: 'done' });
    await renderThemed(<AgendaScreen />);
    expect(screen.getByText('Listo por hoy. Cierra la app y descansa')).toBeTruthy();
  });

  it('shows the empty state for a day without agenda', async () => {
    mockToday(dataWith(), { empty: true });
    await renderThemed(<AgendaScreen />);
    expect(screen.getByText('Tu día aparecerá aquí')).toBeTruthy();
  });
});

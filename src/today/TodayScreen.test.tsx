import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { buildTimeline } from '../domain/today/timeline';
import { buildAgenda } from '../domain/agenda/buildAgenda';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { setLanguage } from '../i18n';
import { loadDefaultTemplates } from '../templates/defaults';
import { ThemeProvider } from '../ui/theme';

import { TodayScreen } from './TodayScreen';
import type { TodayData } from './todayData';
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
    facts: { gymDone: false, view: {} as TodayData['facts']['view'] },
    state: { date: '2026-10-05', skipped: [], acked: [], snoozed: {} },
    activityToday: activity,
    routineName: 'Día 1',
    gymGoal,
    identity: { gymDates: [], plannedGymDays: 4, waterDays: null, firstDay: false, ...overrides },
  };
}

function mockToday(
  data: TodayData,
  options: { allDone?: boolean; status?: 'done' | 'upcoming'; empty?: boolean } = {},
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
    reload: jest.fn(async () => undefined),
  };
  mockedUseToday.mockReturnValue({
    load,
    view: {
      data,
      entries,
      allDone: options.allDone ?? false,
      greeting: 'Buenos días',
      identity: 'Un paso a la vez. Hoy cuenta.',
    },
    ...handlers,
  });
  return handlers;
}

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

beforeEach(() => {
  setLanguage('es');
});

describe('TodayScreen', () => {
  it('greets, shows the identity phrase and the timeline of the day', async () => {
    mockToday(dataWith());
    await renderThemed(<TodayScreen />);
    expect(screen.getByText('Buenos días')).toBeTruthy();
    expect(screen.getByText('Un paso a la vez. Hoy cuenta.')).toBeTruthy();
    expect(screen.getByText('Tu día')).toBeTruthy();
    expect(screen.getByText('Día 1')).toBeTruthy();
    // No fake suggestion / insight cards yet.
    expect(screen.queryByText('Aceptar')).toBeNull();
  });

  it('highlights the goal of the first main exercise on the gym row', async () => {
    mockToday(
      dataWith({}, undefined, {
        exercise: 'Sentadilla',
        message: { key: 'gym.target.chooseWeight', params: {} },
      }),
    );
    await renderThemed(<TodayScreen />);
    expect(
      screen.getByText(
        'Sentadilla: Elige un peso con el que te queden 1 o 2 repeticiones en reserva.',
      ),
    ).toBeTruthy();
  });

  it('first day: mascot hola and the agenda, no charts', async () => {
    mockToday(dataWith({ firstDay: true }));
    await renderThemed(<TodayScreen />);
    expect(screen.getByText('Hola. Empezamos hoy, sin prisa.')).toBeTruthy();
    expect(screen.getByText('Tu día')).toBeTruthy();
  });

  it('asks "¿Te moviste hoy?" only while it is unanswered', async () => {
    const handlers = mockToday(dataWith());
    const { unmount } = await renderThemed(<TodayScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: /Fui al gym/ }));
    expect(handlers.answerActivity).toHaveBeenCalledWith('gym');
    await unmount();

    mockToday(dataWith({}, 'gym'));
    await renderThemed(<TodayScreen />);
    expect(screen.queryByText('¿Te moviste hoy?')).toBeNull();
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

  it('long press opens the options with postpone and skip', async () => {
    const handlers = mockToday(dataWith());
    await renderThemed(<TodayScreen />);
    await fireEvent(screen.getAllByRole('button', { name: /Gym/ })[0]!, 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Omitir hoy' }));
    expect(handlers.skip).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state for a day without agenda', async () => {
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

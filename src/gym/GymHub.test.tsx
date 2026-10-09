import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { router } from 'expo-router';

import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';
import { HistoryDetailScreen, ProgramDetailScreen, VolumeDetailScreen } from './GymDetailScreens';
import { GymHubScreen } from './GymHub';
import { historyEntries, sessionsThisWeek } from './gymHistory';
import type { GymProgram } from './program';
import { useGymTab, type GymTabState } from './useGym';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('./useGym', () => ({ useGymTab: jest.fn() }));

const TODAY = '2026-10-07';

const PROGRAM = {
  moduleName: 'Gym',
  id: 'fullbody',
  name: 'Full body 3 días',
  rules: { stallSessions: 3, deloadPct: 10 },
  routines: [
    {
      id: 'a',
      name: 'Día A',
      steps: [
        { id: 'sentadilla', type: 'sets', name: 'Sentadilla', sets: 3, reps: '8-10' },
        { id: 'press', type: 'sets', name: 'Press banca', sets: 3, reps: '8-10' },
      ],
    },
    {
      id: 'b',
      name: 'Día B',
      steps: [{ id: 'remo', type: 'sets', name: 'Remo', sets: 3, reps: '8-10' }],
    },
  ],
} as unknown as GymProgram;

const ROWS = [
  {
    session: { id: 2, routineId: 'a', date: '2026-10-06', finishedAt: 1 },
    sets: [
      { stepId: 'sentadilla', setIndex: 0, weightKg: 40, reps: 8 },
      { stepId: 'sentadilla', setIndex: 1, weightKg: 40, reps: 8 },
      { stepId: 'press', setIndex: 0, weightKg: null, reps: 10 },
    ],
  },
  { session: { id: 1, routineId: 'old', date: '2026-09-28', finishedAt: 1 }, sets: [] },
];

const READY: Extract<GymTabState, { status: 'ready' }> = {
  status: 'ready',
  program: PROGRAM,
  todayRoutineId: 'a',
  resumableRoutineIds: [],
  volume: {
    today: TODAY,
    level: 'beginner',
    goal: 'hypertrophy',
    sets: [{ stepId: 'sentadilla', doneAt: new Date('2026-10-06T10:00:00').getTime() }],
    stepMuscles: { sentadilla: ['cuadriceps'] },
  },
  goals: {
    a: {
      exercise: 'Sentadilla',
      message: { key: 'gym.target.addRep', params: { weightKg: 40, reps: 9 } },
    },
  },
  week: { done: 1, planned: 3 },
  history: historyEntries(ROWS, PROGRAM),
};

function mockTab(state: GymTabState = READY) {
  const reload = jest.fn();
  jest.mocked(useGymTab).mockReturnValue({ ...state, reload });
  return reload;
}

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

beforeEach(() => {
  setLanguage('es');
  jest.mocked(router.push).mockClear();
});

describe('gym history helpers', () => {
  it('counts this week sessions with sets and groups history by exercise', () => {
    expect(sessionsThisWeek(ROWS, TODAY)).toBe(1);
    const [entry, ...rest] = historyEntries(ROWS, PROGRAM);
    expect(rest).toHaveLength(0);
    expect(entry?.setCount).toBe(3);
    expect(entry?.volumeKg).toBe(640);
    expect(entry?.exercises.map((exercise) => exercise.stepId)).toEqual(['sentadilla', 'press']);
  });
});

describe('GymHubScreen (bento hub)', () => {
  it('renders the tiles from the data with spoken summaries', async () => {
    mockTab();
    await renderThemed(<GymHubScreen />);
    expect(screen.getByText('Día A')).toBeTruthy();
    expect(screen.getByText('Hoy: 40 kg, intenta llegar a 9 repeticiones.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Empezar' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Semana: 1 de 3 sesiones. Abrir historial' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Volumen: 1 series esta semana. Abrir detalle' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Programa Full body 3 días, 2 rutinas. Abrir programa' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Historial: última sesión el 6/10. Abrir historial' }),
    ).toBeTruthy();
  });

  it('routes every tile to its page and the CTA to the session', async () => {
    mockTab({ ...READY, resumableRoutineIds: ['a'] });
    await renderThemed(<GymHubScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/gym/session',
      params: { routineId: 'a' },
    });
    await fireEvent.press(screen.getByRole('button', { name: /^Volumen/ }));
    expect(router.push).toHaveBeenLastCalledWith('/gym/volumen');
    await fireEvent.press(screen.getByRole('button', { name: /^Programa/ }));
    expect(router.push).toHaveBeenLastCalledWith('/gym/programa');
    await fireEvent.press(screen.getByRole('button', { name: /^Crear rutina/ }));
    expect(router.push).toHaveBeenLastCalledWith('/crear-rutina');
    await fireEvent.press(screen.getByRole('button', { name: /^Historial/ }));
    expect(router.push).toHaveBeenLastCalledWith('/gym/historial');
    await fireEvent.press(screen.getByRole('button', { name: /^Semana/ }));
    expect(router.push).toHaveBeenLastCalledWith('/gym/historial');
  });

  it('carousel: every routine, the suggested one first with its badge', async () => {
    mockTab({ ...READY, todayRoutineId: 'b' });
    await renderThemed(<GymHubScreen />);
    const cards = screen.getAllByTestId(/^routine-card-/, { includeHiddenElements: true });
    expect(cards.map((card) => card.props.testID)).toEqual(['routine-card-b', 'routine-card-a']);
    expect(screen.getByLabelText(/^Día B, sugerida, 1 de 2\. 1 ejercicios/)).toBeTruthy();
    expect(screen.getByText('Sugerida')).toBeTruthy();
  });

  it('carousel: next action moves to another routine and Empezar starts that one', async () => {
    mockTab();
    await renderThemed(<GymHubScreen />);
    const first = screen.getByLabelText(/^Día A, sugerida, 1 de 2/);
    await fireEvent(first, 'accessibilityAction', { nativeEvent: { actionName: 'next' } });
    expect(screen.getByLabelText(/^Día B, 2 de 2/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Empezar' }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/gym/session',
      params: { routineId: 'b' },
    });
  });

  it('carousel: two routines open today each continue their own session', async () => {
    mockTab({ ...READY, resumableRoutineIds: ['a', 'b'] });
    await renderThemed(<GymHubScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/gym/session',
      params: { routineId: 'a' },
    });
    const first = screen.getByLabelText(/^Día A, sugerida, 1 de 2/);
    await fireEvent(first, 'accessibilityAction', { nativeEvent: { actionName: 'next' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/gym/session',
      params: { routineId: 'b' },
    });
  });

  it('carousel: a new suggestion goes back to the first card', async () => {
    mockTab();
    const view = await renderThemed(<GymHubScreen />);
    const first = screen.getByLabelText(/^Día A, sugerida, 1 de 2/);
    await fireEvent(first, 'accessibilityAction', { nativeEvent: { actionName: 'next' } });
    expect(screen.getByLabelText(/^Día B, 2 de 2/)).toBeTruthy();
    mockTab({ ...READY, todayRoutineId: 'b' });
    await view.rerender(
      <ThemeProvider mode="light">
        <GymHubScreen />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText(/^Día B, sugerida, 1 de 2/)).toBeTruthy();
  });

  it('offers the generator when there is no program', async () => {
    mockTab({ ...READY, program: null });
    await renderThemed(<GymHubScreen />);
    expect(screen.queryByTestId('bento-grid')).toBeNull();
  });
});

describe('Gym detail pages', () => {
  it('program: lists the routines, starts one, edits and imports', async () => {
    mockTab();
    await renderThemed(<ProgramDetailScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Empezar Día B' }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/gym/session',
      params: { routineId: 'b' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Editar programa' }));
    expect(router.push).toHaveBeenLastCalledWith('/editar-programa');
    await fireEvent.press(screen.getByRole('button', { name: 'Importar programa' }));
    expect(router.push).toHaveBeenLastCalledWith('/importar-programa');
  });

  it('volume: shows this week per muscle', async () => {
    mockTab();
    await renderThemed(<VolumeDetailScreen />);
    expect(screen.getByText('Series por músculo esta semana')).toBeTruthy();
  });

  it('history: shows each session with its sets and volume', async () => {
    mockTab();
    await renderThemed(<HistoryDetailScreen />);
    expect(screen.getByText('3 series · 640 kg')).toBeTruthy();
    expect(screen.getByText('Sentadilla: 40 kg × 8, 40 kg × 8')).toBeTruthy();
    expect(screen.getByText('Press banca: 10 reps')).toBeTruthy();
  });

  it('history: empty state without sessions', async () => {
    mockTab({ ...READY, history: [] });
    await renderThemed(<HistoryDetailScreen />);
    expect(screen.getByText('Aún no hay sesiones')).toBeTruthy();
  });
});

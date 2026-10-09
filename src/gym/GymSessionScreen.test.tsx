import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { setLanguage } from '../i18n';
import type { Step } from '../templates/schema';
import { ThemeProvider } from '../ui/theme';
import { buildSessionPages, GymSessionScreen } from './GymSessionScreen';
import { buildExerciseView, type SetsStep } from './sessionViewModel';
import { useGymSession, type SessionExercise } from './useGym';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ routineId: 'a' }),
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => undefined }));
jest.mock('../timers', () => {
  const { createStore } = jest.requireActual<typeof import('zustand/vanilla')>('zustand/vanilla');
  const store = createStore(() => ({
    active: null,
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    addTime: jest.fn(),
    skip: jest.fn(),
    dismiss: jest.fn(),
  }));
  return {
    getTimerStore: () => store,
    useActiveTimer: () => null,
    useTimerFeedback: () => undefined,
  };
});
jest.mock('./useGym', () => ({ useGymSession: jest.fn() }));

const squat: SetsStep = {
  type: 'sets',
  id: 'squat',
  name: 'Sentadilla',
  sets: 2,
  reps: '8–10',
  restSec: 90,
};
const row: SetsStep = { type: 'sets', id: 'row', name: 'Remo', sets: 2, reps: '8–10', restSec: 90 };
const STEPS: Step[] = [
  { type: 'check', id: 'move', name: 'Movilidad de cadera' },
  squat,
  row,
  {
    type: 'timed',
    id: 'bike',
    name: 'Bici suave',
    totalSec: 600,
    segments: [{ atSec: 0, label: 'Suave' }],
  },
];
const EXERCISES: SessionExercise[] = [squat, row].map((step) => ({
  step,
  view: buildExerciseView(step, []),
}));

function mockSession(overrides: Partial<ReturnType<typeof useGymSession>> = {}) {
  const handlers = {
    setDone: jest.fn(),
    setUndone: jest.fn(),
    setRir: jest.fn(),
    startHold: jest.fn(),
    clearError: jest.fn(),
    finish: jest.fn(async () => ({ status: 'empty' as const })),
  };
  jest.mocked(useGymSession).mockReturnValue({
    state: { status: 'ready', routineName: 'Día A', steps: STEPS, exercises: EXERCISES },
    logsByStep: new Map(),
    setsDone: 1,
    summary: null,
    error: null,
    ...handlers,
    ...overrides,
  } as unknown as ReturnType<typeof useGymSession>);
  return handlers;
}

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

const position = () => screen.getByTestId('session-dots').props.accessibilityLabel as string;

beforeEach(() => {
  setLanguage('es');
});

describe('buildSessionPages', () => {
  it('puts the warm-up first, one page per exercise, extras, then finish', () => {
    expect(buildSessionPages(STEPS, EXERCISES).map((page) => page.key)).toEqual([
      'warmup',
      'sets:squat',
      'sets:row',
      'extras:bike',
      'finish',
    ]);
  });

  it('has only the finish page without steps', () => {
    expect(buildSessionPages([], []).map((page) => page.kind)).toEqual(['finish']);
  });
});

describe('GymSessionScreen (one exercise per page)', () => {
  it('renders every page and the position of the current one', async () => {
    mockSession();
    await renderThemed(<GymSessionScreen />);
    expect(screen.getByText('Día A')).toBeTruthy();
    expect(screen.getByTestId('session-page-sets:squat')).toBeTruthy();
    expect(screen.getByTestId('session-page-finish')).toBeTruthy();
    expect(screen.getAllByTestId('exercise-target').length).toBeGreaterThan(0);
    expect(position()).toBe('Paso 1 de 5: Calentamiento');
    expect(screen.getByRole('button', { name: 'Paso anterior' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('moves with the previous / next buttons', async () => {
    mockSession();
    await renderThemed(<GymSessionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Paso siguiente' }));
    expect(position()).toBe('Paso 2 de 5: Sentadilla');
    await fireEvent.press(screen.getByRole('button', { name: 'Paso siguiente' }));
    expect(position()).toBe('Paso 3 de 5: Remo');
    await fireEvent.press(screen.getByRole('button', { name: 'Paso anterior' }));
    expect(position()).toBe('Paso 2 de 5: Sentadilla');
  });

  it('follows a swipe to the last page and finishes from there', async () => {
    const handlers = mockSession();
    await renderThemed(<GymSessionScreen />);
    const pager = screen.getByTestId('session-pager');
    await fireEvent(pager, 'layout', { nativeEvent: { layout: { width: 300, height: 600 } } });
    await fireEvent(pager, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 100000, y: 0 } },
    });
    expect(position()).toBe('Paso 5 de 5: Terminar');
    expect(screen.getByRole('button', { name: 'Paso siguiente' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Terminar entrenamiento' }));
    expect(handlers.finish).toHaveBeenCalled();
  });

  it('shows the summary instead of the pager once finished', async () => {
    mockSession({
      summary: { setsDone: 4, setsPlanned: 4, volumeKg: 800, targetsMet: 1, targetsTotal: 2 },
    });
    await renderThemed(<GymSessionScreen />);
    expect(screen.queryByTestId('session-pager')).toBeNull();
    expect(screen.getByRole('button', { name: 'Listo' })).toBeTruthy();
  });
});

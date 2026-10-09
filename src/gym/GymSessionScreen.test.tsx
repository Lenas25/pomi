import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, type AlertButton } from 'react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';

import { setLanguage } from '../i18n';
import type { Step } from '../templates/schema';
import { ThemeProvider } from '../ui/theme';
import { buildSessionPages, GymSessionScreen, initialPageIndex } from './GymSessionScreen';
import { getDoneSteps, saveDoneSteps, sessionStepsKey, clearDoneSteps } from './sessionStepsStore';
import { buildExerciseView, type SetsStep, type StoredSet } from './sessionViewModel';
import { useGymSession, type SessionExercise } from './useGym';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
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
    discard: jest.fn(async () => true),
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

const logged = (stepId: string, count: number): StoredSet[] =>
  Array.from({ length: count }, (_, setIndex) => ({
    stepId,
    setIndex,
    weightKg: 40,
    reps: 8,
    rir: null,
  }));

describe('initialPageIndex', () => {
  const pages = buildSessionPages(STEPS, EXERCISES);

  it('opens a fresh session on the warm-up', () => {
    expect(initialPageIndex(pages, new Map())).toBe(0);
  });

  it('resumes on the first exercise with pending sets, or the finish page', () => {
    expect(initialPageIndex(pages, new Map([['squat', logged('squat', 1)]]))).toBe(1);
    expect(initialPageIndex(pages, new Map([['squat', logged('squat', 2)]]))).toBe(2);
    const all = new Map([
      ['squat', logged('squat', 2)],
      ['row', logged('row', 2)],
    ]);
    expect(initialPageIndex(pages, all)).toBe(pages.length - 1);
  });
});

describe('sessionStepsStore', () => {
  it('keeps the checked warm-up steps of a session until it is cleared', () => {
    const key = sessionStepsKey('2026-10-09', 'a');
    saveDoneSteps(key, new Set(['move']));
    expect([...getDoneSteps(key)]).toEqual(['move']);
    clearDoneSteps(key);
    expect(getDoneSteps(key).size).toBe(0);
  });
});

describe('GymSessionScreen (one exercise per page)', () => {
  it('resumes on the first exercise with pending sets', async () => {
    mockSession({ logsByStep: new Map([['squat', logged('squat', 2)]]) });
    await renderThemed(<GymSessionScreen />);
    expect(position()).toBe('Paso 3 de 5: Remo');
  });

  it('hides the off-screen pages from screen readers and announces a page change', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    mockSession();
    await renderThemed(<GymSessionScreen />);
    const hidden = (key: string) =>
      screen.getByTestId(`session-page-${key}`, { includeHiddenElements: true }).props
        .accessibilityElementsHidden as boolean;
    expect(hidden('warmup')).toBe(false);
    expect(hidden('sets:squat')).toBe(true);
    expect(
      screen.getByTestId('session-page-sets:squat', { includeHiddenElements: true }).props
        .importantForAccessibility,
    ).toBe('no-hide-descendants');
    expect(announce).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Paso siguiente' }));
    expect(hidden('sets:squat')).toBe(false);
    expect(announce).toHaveBeenCalledWith('Paso 2 de 5: Sentadilla');
    announce.mockRestore();
  });

  it('renders every page and the position of the current one', async () => {
    mockSession();
    await renderThemed(<GymSessionScreen />);
    expect(screen.getByText('Día A')).toBeTruthy();
    expect(
      screen.getByTestId('session-page-sets:squat', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.getByTestId('session-page-finish', { includeHiddenElements: true })).toBeTruthy();
    expect(
      screen.getAllByTestId('exercise-target', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
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

  it('discards the session after confirming and goes back to the Gym hub', async () => {
    const handlers = mockSession();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.mocked(router.back).mockClear();
    await renderThemed(<GymSessionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Descartar sesión' }));
    const [title, , buttons] = alert.mock.calls[0] as [string, string, AlertButton[]];
    expect(title).toBe('¿Descartar esta sesión?');
    buttons.find((button) => button.style === 'cancel')?.onPress?.();
    expect(handlers.discard).not.toHaveBeenCalled();
    await act(async () => {
      buttons.find((button) => button.style === 'destructive')?.onPress?.();
    });
    expect(handlers.discard).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('stays in the session when the discard fails', async () => {
    mockSession({ discard: jest.fn(async () => false) });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.mocked(router.back).mockClear();
    await renderThemed(<GymSessionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Descartar sesión' }));
    const [, , buttons] = alert.mock.calls[0] as [string, string, AlertButton[]];
    await act(async () => {
      buttons.find((button) => button.style === 'destructive')?.onPress?.();
    });
    expect(router.back).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

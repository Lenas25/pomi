import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { router } from 'expo-router';

import { consistency } from '../domain/habits/consistency';
import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';
import {
  CheckDetailScreen,
  FoodDetailScreen,
  SleepDetailScreen,
  StepsDetailScreen,
  WaterDetailScreen,
} from './HabitDetailScreens';
import { HabitsScreen } from './HabitsScreen';
import type { HabitsView } from './habitsView';
import type { SleepDetail } from './sleepStats';
import { useHabits } from './useHabits';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('./useHabits', () => ({ useHabits: jest.fn() }));
jest.mock('../companion/loadCompanion', () => ({
  loadCompanion: jest.fn(async () => ({
    sleepDebt: null,
    jetlag: null,
    water: null,
    rhythm: { learning: true },
  })),
}));
jest.mock('../db', () => ({
  getRepositories: () => ({ settings: { get: jest.fn(async () => ({ waterGlassesRest: 9 })) } }),
}));

const TODAY = '2026-10-06';

const VIEW: HabitsView = {
  water: {
    habitId: 'agua',
    name: 'Agua',
    glassMl: 250,
    value: 5,
    target: { glasses: 8, ml: 2000, glassMl: 250, gymDay: false },
    consistency: consistency(TODAY, ['2026-10-04', '2026-10-05']),
  },
  steps: {
    habitId: 'pasos',
    name: 'Pasos',
    steps: 3000,
    source: null,
    plan: { phase: 'active', baselineDaysLeft: 0, baseline: 5000, goal: 6000 },
    consistency: consistency(TODAY, []),
  },
  checks: [
    {
      habitId: 'pausa-activa',
      name: 'Pausa activa',
      how: 'Levántate 2 minutos cada hora.',
      done: false,
      consistency: consistency(TODAY, ['2026-10-05']),
    },
  ],
  food: {
    prompt: '¿Qué comiste hoy?',
    note: '',
    consistency: consistency(TODAY, ['2026-10-05']),
    recent: [{ date: '2026-10-05', text: 'Lentejas' }],
  },
  checkins: { morning: { enabled: true, done: true }, night: { enabled: true, done: false } },
  activityToday: undefined,
};

const SLEEP: SleepDetail = {
  summary: { days: 1, avgDurationMin: 450, wakeRegularityMin: null },
  nights: [{ date: '2026-10-06', bed: '23:00', wake: '06:30', durationMin: 450, quality: 4 }],
};

function mockHabits() {
  const handlers = {
    refresh: jest.fn(async () => undefined),
    connect: jest.fn(async () => undefined),
    setWater: jest.fn(async () => undefined),
    setCheck: jest.fn(async () => undefined),
    saveSteps: jest.fn(async () => undefined),
    saveFood: jest.fn(async () => undefined),
    saveGoals: jest.fn(async () => undefined),
    answerActivity: jest.fn(async () => undefined),
    openHealthSettings: jest.fn(async () => undefined),
  };
  jest.mocked(useHabits).mockReturnValue({
    state: { status: 'ready', today: TODAY, view: VIEW, sleep: SLEEP },
    feed: 'connected',
    connecting: false,
    ...handlers,
  } as unknown as ReturnType<typeof useHabits>);
  return handlers;
}

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

beforeEach(() => {
  setLanguage('es');
  jest.mocked(router.push).mockClear();
});

describe('HabitsScreen (bento hub)', () => {
  it('renders one tile per habit with a spoken summary', async () => {
    mockHabits();
    await renderThemed(<HabitsScreen />);
    expect(screen.getByRole('button', { name: 'Agua: 5 de 8 vasos. Abrir detalle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Pasos: 3[.,]?000 de 6[.,]?000/ })).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Sueño: 7 h 30 min, anoche, calidad 4/5. Abrir detalle',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Pausa activa: pendiente. 1 de los últimos 10 días. Abrir detalle',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Notas de comida: Sin nota. Abrir detalle' }),
    ).toBeTruthy();
    // The old long card stack is gone: no steps input on the hub.
    expect(screen.queryByText('Guardar pasos')).toBeNull();
  });

  it('tiles open their detail pages; +1 adds a glass in place', async () => {
    const handlers = mockHabits();
    await renderThemed(<HabitsScreen />);
    const push = jest.mocked(router.push);
    await fireEvent.press(screen.getByRole('button', { name: /^Agua:/ }));
    expect(push).toHaveBeenLastCalledWith('/habitos/agua');
    await fireEvent.press(screen.getByRole('button', { name: /^Pasos:/ }));
    expect(push).toHaveBeenLastCalledWith('/habitos/pasos');
    await fireEvent.press(screen.getByRole('button', { name: /^Sueño:/ }));
    expect(push).toHaveBeenLastCalledWith('/habitos/sueno');
    await fireEvent.press(screen.getByRole('button', { name: /^Pausa activa:/ }));
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/habitos/[id]',
      params: { id: 'pausa-activa' },
    });
    await fireEvent.press(screen.getByRole('button', { name: /^Notas de comida:/ }));
    expect(push).toHaveBeenLastCalledWith('/habitos/comida');
    await fireEvent.press(screen.getByRole('button', { name: 'Sumar un vaso' }));
    expect(handlers.setWater).toHaveBeenCalledWith('agua', 6);
  });

  it('the movement tile asks "¿Te moviste hoy?" in a sheet', async () => {
    const handlers = mockHabits();
    await renderThemed(<HabitsScreen />);
    await fireEvent.press(
      screen.getByRole('button', { name: '¿Te moviste hoy? Sin responder. Responder' }),
    );
    await fireEvent.press(screen.getByRole('radio', { name: /Fui al gym/ }));
    expect(handlers.answerActivity).toHaveBeenCalledWith('gym');
  });
});

describe('Habits detail pages', () => {
  it('/habitos/agua: counter, consistency and goal editor', async () => {
    const handlers = mockHabits();
    await renderThemed(<WaterDetailScreen />);
    expect(screen.getByText('5 de 8 vasos')).toBeTruthy();
    expect(screen.getAllByText('2 de los últimos 10 días').length).toBeGreaterThan(0);
    expect(await screen.findByText('Tu meta')).toBeTruthy();
    expect(screen.getByText('9 vasos')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(jest.mocked(router.back)).toHaveBeenCalled();
    expect(handlers.saveGoals).not.toHaveBeenCalled();
  });

  it('/habitos/pasos: count, manual input and baseline', async () => {
    mockHabits();
    await renderThemed(<StepsDetailScreen />);
    expect(screen.getByText('Guardar pasos')).toBeTruthy();
    expect(screen.getByText(/Tu línea base: 5[.,]?000 pasos al día\./)).toBeTruthy();
  });

  it('/habitos/sueno: average, nights and the cycles link', async () => {
    mockHabits();
    await renderThemed(<SleepDetailScreen />);
    expect(screen.getByText('Promedio de los últimos 1 días: 7 h 30 min.')).toBeTruthy();
    expect(screen.getByText('23:00 a 06:30 · 7 h 30 min · Calidad 4/5')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Calcular horas para dormir' }));
    expect(jest.mocked(router.push)).toHaveBeenCalledWith('/ciclos-sueno');
  });

  it('/habitos/[id]: marks a check habit done', async () => {
    const handlers = mockHabits();
    await renderThemed(<CheckDetailScreen habitId="pausa-activa" />);
    expect(screen.getByText('Levántate 2 minutos cada hora.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Pausa activa: pendiente'));
    expect(handlers.setCheck).toHaveBeenCalledWith('pausa-activa', true);
  });

  it('/habitos/[id]: unknown habit shows a not-found state', async () => {
    mockHabits();
    await renderThemed(<CheckDetailScreen habitId="nope" />);
    expect(screen.getByText('No encontramos este hábito.')).toBeTruthy();
  });

  it('/habitos/comida: note editor and recent notes', async () => {
    mockHabits();
    await renderThemed(<FoodDetailScreen />);
    expect(screen.getByLabelText('¿Qué comiste hoy?')).toBeTruthy();
    expect(screen.getByText('Lentejas')).toBeTruthy();
  });
});

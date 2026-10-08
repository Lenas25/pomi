import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';

import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';

import type { ProgressData } from './loadProgress';
import { ProgressScreen } from './ProgressScreen';
import { useProgress, type ProgressState } from './useProgress';

jest.mock('expo-router', () => ({
  // Runs the focus effect once on mount, like a screen that just got focus.
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react') as typeof import('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(effect, []);
  },
}));
jest.mock('./useProgress', () => ({ useProgress: jest.fn() }));
jest.mock('../photos/expoPhotoFs', () => ({
  expoPhotoFs: {
    exists: (name: string) => name !== 'missing.jpg',
    uriOf: (name: string) => `file:///photos/${name}`,
  },
}));

const mockPush = jest.fn();
const mocked = jest.mocked(useProgress);

function mockProgress(state: ProgressState) {
  const handlers = {
    load: jest.fn(async () => undefined),
    saveMetric: jest.fn(async () => undefined),
    removePhoto: jest.fn(async () => undefined),
  };
  mocked.mockReturnValue({ state, ...handlers });
  return handlers;
}

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

const base: ProgressData = {
  today: '2026-10-07',
  startedOn: '2026-09-20',
  gymDays: [{ days: [1, 3, 5], anchor: 'gymMorning' }],
  sessions: [],
  habitDates: [],
  exerciseNames: { hip: 'Hip thrust' },
  metrics: [],
  photos: [],
  poses: [],
  poseNames: {},
  monthlyDone: false,
};

const set = (weightKg: number, reps: number) => ({ stepId: 'hip', weightKg, reps });

beforeEach(() => setLanguage('es'));

describe('ProgressScreen', () => {
  it('shows an EmptyState per section when there is no data (no fake numbers)', async () => {
    mockProgress({ status: 'ready', data: base });
    await renderThemed(<ProgressScreen />);
    expect(screen.getByText('Tu constancia aparecerá aquí')).toBeTruthy();
    expect(screen.getByText('Tu fuerza aparecerá aquí')).toBeTruthy();
    expect(screen.getByText('Tus medidas aparecerán aquí')).toBeTruthy();
    expect(screen.getByText('Tus fotos aparecerán aquí')).toBeTruthy();
    expect(screen.getByText('Aún no hay hallazgos')).toBeTruthy();
  });

  it('describes the strength chart for TalkBack and labels the estimate', async () => {
    mockProgress({
      status: 'ready',
      data: {
        ...base,
        sessions: [
          { date: '2026-08-10', sets: [set(40, 8)] },
          { date: '2026-10-05', sets: [set(50, 8)] },
        ],
      },
    });
    await renderThemed(<ProgressScreen />);
    const label = 'Hip thrust: de 50,7 a 63,3 kg estimados en 8 semanas.';
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByText(/estimación de tu mejor serie/i)).toBeTruthy();
  });

  it('describes the weekly sessions and keeps the language gentle', async () => {
    mockProgress({
      status: 'ready',
      data: { ...base, sessions: [{ date: '2026-10-06', sets: [set(40, 8)] }] },
    });
    await renderThemed(<ProgressScreen />);
    expect(screen.getByText('Esta semana: 1 de 3 sesiones.')).toBeTruthy();
    expect(
      screen.getByLabelText(/semana del 28\/9: 0 de 3; semana del 5\/10: 1 de 3\./),
    ).toBeTruthy();
  });

  it('saves a measurement through the entry form and rejects a typo', async () => {
    const handlers = mockProgress({
      status: 'ready',
      data: {
        ...base,
        metrics: [{ id: 'peso', name: 'Peso', unit: 'kg', frequency: 'weekly', entries: [] }],
      },
    });
    await renderThemed(<ProgressScreen />);
    const input = screen.getByLabelText('Nuevo valor (kg)');
    await fireEvent.changeText(input, 'abc');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      screen.getByText('Escribe un número con un decimal como máximo, por ejemplo 61,5.'),
    ).toBeTruthy();
    expect(handlers.saveMetric).not.toHaveBeenCalled();

    await fireEvent.changeText(input, '61,5');
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });
    expect(handlers.saveMetric).toHaveBeenCalledWith('peso', 61.5);
    expect(screen.getByText('Guardado.')).toBeTruthy();
  });

  it('offers a retry when the load fails', async () => {
    const handlers = mockProgress({ status: 'error' });
    await renderThemed(<ProgressScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(handlers.load).toHaveBeenCalledTimes(2);
  });
});

describe('ProgressScreen: monthly review and photos', () => {
  const photos = [
    { id: 2, date: '2026-10-01', pose: 'frente', uri: 'b.jpg' },
    { id: 1, date: '2026-09-01', pose: 'frente', uri: 'missing.jpg' },
  ];

  beforeEach(() => mockPush.mockClear());

  it('opens the monthly review and the 30-day comparison', async () => {
    mockProgress({ status: 'ready', data: base });
    await renderThemed(<ProgressScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Empezar la revisión' }));
    expect(mockPush).toHaveBeenCalledWith('/revision-mensual');
    await fireEvent.press(screen.getByRole('button', { name: 'Ver «Tú hace 30 días vs. hoy»' }));
    expect(mockPush).toHaveBeenCalledWith('/comparacion');
  });

  it('says so when this month review is already done', async () => {
    mockProgress({ status: 'ready', data: { ...base, monthlyDone: true } });
    await renderThemed(<ProgressScreen />);
    expect(screen.getByText('Ya hiciste la revisión de este mes.')).toBeTruthy();
  });

  it('shows the photos newest first, with a calm placeholder for a file that is not here', async () => {
    mockProgress({ status: 'ready', data: { ...base, photos } });
    await renderThemed(<ProgressScreen />);
    expect(screen.queryByText('Tus fotos aparecerán aquí')).toBeNull();
    expect(screen.getByRole('button', { name: 'Frente, 1/10/2026' })).toBeTruthy();
    expect(screen.getByText('Foto no disponible')).toBeTruthy();
  });

  it('asks before deleting a photo, and deletes it (file included) on confirm', async () => {
    const handlers = mockProgress({ status: 'ready', data: { ...base, photos } });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderThemed(<ProgressScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Frente, 1/10/2026' }));
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((button) => button.text)).toEqual(['Cancelar', 'Eliminar']);
    expect(handlers.removePhoto).not.toHaveBeenCalled();
    await act(async () => {
      buttons[1]?.onPress?.();
    });
    expect(handlers.removePhoto).toHaveBeenCalledWith(2);
    alert.mockRestore();
  });
});

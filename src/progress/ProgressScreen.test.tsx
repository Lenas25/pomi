import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';

import type { ProgressData } from './loadProgress';
import {
  ConsistencyDetailScreen,
  InsightsDetailScreen,
  MeasurementsDetailScreen,
  RhythmDetailScreen,
  StrengthDetailScreen,
} from './ProgressDetailScreens';
import { ProgressScreen } from './ProgressScreen';
import { useAiStatus } from '../ai/useAiStatus';
import { useProgress, type ProgressState } from './useProgress';

jest.mock('expo-router', () => ({
  // Runs the focus effect once on mount, like a screen that just got focus.
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  },
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react') as typeof import('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(effect, []);
  },
}));
jest.mock('./useProgress', () => ({ useProgress: jest.fn() }));
jest.mock('../ai/useAiStatus', () => ({ useAiStatus: jest.fn() }));
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

function mockAi(ready: boolean) {
  jest.mocked(useAiStatus).mockReturnValue({
    status: ready ? { loaded: true, ready: true } : { loaded: false },
    reload: jest.fn(async () => undefined),
  } as unknown as ReturnType<typeof useAiStatus>);
}

beforeEach(() => {
  setLanguage('es');
  mockPush.mockClear();
  mockAi(false);
});

describe('ProgressScreen (bento hub)', () => {
  const rich: ProgressData = {
    ...base,
    sessions: [
      { date: '2026-08-10', sets: [set(40, 8)] },
      { date: '2026-10-06', sets: [set(50, 8)] },
    ],
    metrics: [
      {
        id: 'peso',
        name: 'Peso',
        unit: 'kg',
        frequency: 'weekly',
        entries: [{ date: '2026-10-05', value: 61.5 }],
      },
    ],
    photos: [{ id: 2, date: '2026-10-01', pose: 'frente', uri: 'b.jpg' }],
    monthlyDone: true,
  };

  it('renders the tiles from the data with spoken summaries', async () => {
    mockProgress({ status: 'ready', data: rich });
    await renderThemed(<ProgressScreen />);
    expect(
      screen.getByRole('button', {
        name: 'Constancia: 1 de 3 sesiones esta semana. Abrir detalle',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Fuerza: Hip thrust, 63,3 kg estimados. Abrir detalle' }),
    ).toBeTruthy();
    expect(screen.getByText('Hip thrust · +12,6 kg')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Medidas: Peso 61,5 kg. Abrir detalle' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Fotos: 1 fotos. Míralas y bórralas en la galería. Abrir fotos',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Revisión mensual: Hecha este mes. Abrir la comparación',
      }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pregúntale a Pomi. Abrir' })).toBeNull();
  });

  it('routes every tile to its page', async () => {
    mockAi(true);
    mockProgress({ status: 'ready', data: rich });
    await renderThemed(<ProgressScreen />);
    const routes: [RegExp, string][] = [
      [/^Constancia/, '/progreso/constancia'],
      [/^Fuerza/, '/progreso/fuerza'],
      [/^Medidas/, '/progreso/medidas'],
      [/^Fotos/, '/fotos'],
      [/^Tu ritmo/, '/progreso/ritmo'],
      [/^Hallazgos/, '/progreso/hallazgos'],
      [/^Compartir/, '/compartir'],
      [/^Pregúntale a Pomi/, '/preguntale-a-pomi'],
      [/^Revisión mensual/, '/comparacion'],
      [/^Empezar la revisión mensual/, '/revision-mensual'],
    ];
    for (const [name, route] of routes) {
      await fireEvent.press(screen.getByRole('button', { name }));
      expect(mockPush).toHaveBeenLastCalledWith(route);
    }
  });

  it('offers a retry when the load fails', async () => {
    const handlers = mockProgress({ status: 'error' });
    await renderThemed(<ProgressScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(handlers.load).toHaveBeenCalledTimes(2);
  });
});

describe('Progreso detail pages', () => {
  it('shows an EmptyState per page when there is no data (no fake numbers)', async () => {
    mockProgress({ status: 'ready', data: base });
    await renderThemed(<ConsistencyDetailScreen />);
    expect(screen.getByText('Tu constancia aparecerá aquí')).toBeTruthy();
    await screen.unmount();
    await renderThemed(<StrengthDetailScreen />);
    expect(screen.getByText('Tu fuerza aparecerá aquí')).toBeTruthy();
    await screen.unmount();
    await renderThemed(<MeasurementsDetailScreen />);
    expect(screen.getByText('Tus medidas aparecerán aquí')).toBeTruthy();
    await screen.unmount();
    await renderThemed(<InsightsDetailScreen />);
    expect(screen.getByText('Aún no hay hallazgos')).toBeTruthy();
    await screen.unmount();
    await renderThemed(<RhythmDetailScreen />);
    expect(screen.getByRole('button', { name: 'Volver a Progreso' })).toBeTruthy();
  });

  it('strength: describes the chart for TalkBack and labels the estimate', async () => {
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
    await renderThemed(<StrengthDetailScreen />);
    const label = 'Hip thrust: de 50,7 a 63,3 kg estimados en 8 semanas.';
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByText(/estimación de tu mejor serie/i)).toBeTruthy();
  });

  it('consistency: describes the weekly sessions and keeps the language gentle', async () => {
    mockProgress({
      status: 'ready',
      data: { ...base, sessions: [{ date: '2026-10-06', sets: [set(40, 8)] }] },
    });
    await renderThemed(<ConsistencyDetailScreen />);
    expect(screen.getByText('Esta semana: 1 de 3 sesiones.')).toBeTruthy();
    expect(
      screen.getByLabelText(/semana del 28\/9: 0 de 3; semana del 5\/10: 1 de 3\./),
    ).toBeTruthy();
  });

  it('measurements: saves through the entry form, rejects a typo, opens the monthly review', async () => {
    const handlers = mockProgress({
      status: 'ready',
      data: {
        ...base,
        metrics: [{ id: 'peso', name: 'Peso', unit: 'kg', frequency: 'weekly', entries: [] }],
      },
    });
    await renderThemed(<MeasurementsDetailScreen />);
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

    await fireEvent.press(screen.getByRole('button', { name: 'Empezar la revisión mensual' }));
    expect(mockPush).toHaveBeenLastCalledWith('/revision-mensual');
  });
});

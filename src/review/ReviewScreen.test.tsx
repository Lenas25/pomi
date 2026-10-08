import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { setLanguage } from '../i18n';
import { buildWeeklyReview } from '../domain/review/buildWeeklyReview';
import { ThemeProvider } from '../ui/theme';

import { ReviewScreen } from './ReviewScreen';
import { useReview, type ReviewLoad } from './useReview';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('./useReview', () => ({ useReview: jest.fn() }));

const mocked = jest.mocked(useReview);

function mockReview(load: ReviewLoad) {
  const handlers = {
    reload: jest.fn(async () => undefined),
    suggestions: {
      busy: false,
      notice: null,
      clearNotice: jest.fn(),
      accept: jest.fn(async () => undefined),
      decline: jest.fn(async () => undefined),
    },
  };
  mocked.mockReturnValue({ load, ...handlers });
  return handlers;
}

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

const empty = buildWeeklyReview(
  {
    gymDays: [],
    anchors: {},
    gymDates: [],
    water: [],
    steps: [],
    stepsGoal: null,
    sleep: [],
    ratings: { quality: [], energy: [], mood: [] },
  },
  '2026-01-26',
);

beforeEach(() => setLanguage('es'));

describe('ReviewScreen', () => {
  it('shows the letter, the summary and the pending suggestions', async () => {
    const handlers = mockReview({
      status: 'ready',
      data: {
        review: {
          ...empty,
          summary: [{ key: 'review.summary.training', params: { done: 2, planned: 3 } }],
        },
        suggestions: [
          {
            id: 9,
            payload: {
              variant: 'sleepEarlier',
              change: { type: 'bedtimeShift', fromMin: 0, toMin: -15 },
              params: { avg: '6 h 40 min', target: '8 h', minutes: 15 },
              evidence: { days: 7 },
            },
          },
        ],
      },
    });
    await renderThemed(<ReviewScreen />);
    expect(screen.getByText('Tu semana')).toBeTruthy();
    expect(screen.getByText('Carta de Pomi')).toBeTruthy();
    expect(screen.getByText('Hola. Aquí va tu semana.')).toBeTruthy();
    expect(screen.getByText('Entrenaste 2 de 3 sesiones')).toBeTruthy();
    expect(screen.getByText('¿Movemos tu hora de dormir 15 minutos antes?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Aceptar' }));
    expect(handlers.suggestions.accept).toHaveBeenCalledWith(9);
  });

  it('is gentle when nothing was recorded and when no suggestion is pending', async () => {
    mockReview({ status: 'ready', data: { review: empty, suggestions: [] } });
    await renderThemed(<ReviewScreen />);
    expect(screen.getByText(/pocos registros, y está bien/)).toBeTruthy();
    expect(screen.getByText('No tienes sugerencias pendientes.')).toBeTruthy();
    expect(screen.getByText(/Aún no hay registros de esta semana/)).toBeTruthy();
  });

  it('shows a retry when it cannot load', async () => {
    const handlers = mockReview({ status: 'error' });
    await renderThemed(<ReviewScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(handlers.reload).toHaveBeenCalled();
  });
});

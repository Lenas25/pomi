import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';
import type { AiSnapshot } from '../domain/ai/context';

import { AskAiScreen } from './AskAiScreen';

const mockSettings = new Map<string, unknown>();

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));
jest.mock('../db', () => ({
  getRepositories: () => ({
    settings: {
      get: async (key: string) => mockSettings.get(key),
      update: async (key: string, fn: (value: unknown) => unknown) => {
        const next = fn(mockSettings.get(key));
        mockSettings.set(key, next);
        return next;
      },
      remove: async (key: string) => {
        mockSettings.delete(key);
      },
    },
  }),
}));
jest.mock('./keyStore', () => ({
  getAiKeyStore: () => ({
    read: async () => 'sk-test',
    save: async () => undefined,
    clear: async () => undefined,
  }),
}));
jest.mock('./useAiStatus', () => ({
  useAiStatus: () => ({
    status: {
      loaded: true,
      ready: true,
      hasKey: true,
      connection: { enabled: true, provider: 'openai', model: 'gpt-x', maxOutputTokens: 256 },
    },
    reload: async () => undefined,
  }),
}));
jest.mock('./loadAiData', () => ({ loadAiSnapshot: async () => mockSnapshot }));

const mockSnapshot: AiSnapshot = {
  today: '2026-10-08',
  periodDays: 30,
  sleep: {
    nights: 12,
    averageMin: 410,
    targetMin: 450,
    wakeRangeMin: 60,
    debtMin: 90,
    socialJetlagMin: null,
  },
  water: null,
  movement: null,
  gym: null,
  checkins: null,
  insights: [],
  suggestions: [],
  foodNotes: [{ date: '2026-10-07', text: 'PRIVATE-FOOD' }],
  dayNotes: [],
};

const wrap = (ui: ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('AskAiScreen', () => {
  const fetchMock = jest.fn(async (_url: string, _init: { body: string }) => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ choices: [{ message: { content: 'Duermes 6 h 50 min de media.' } }] }),
  }));

  beforeAll(() => {
    setLanguage('es');
    (globalThis as { fetch: unknown }).fetch = fetchMock;
  });
  beforeEach(() => {
    mockSettings.clear();
    fetchMock.mockClear();
  });

  it('sends nothing until "Enviar", and sends exactly the previewed text', async () => {
    await wrap(<AskAiScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Tu pregunta'), '¿Cómo duermo?');
    await act(async () => {
      await fireEvent.press(screen.getByText('Revisar qué se envía'));
    });
    const preview = (await screen.findByTestId('ai-preview-message')).props.children as string;
    expect(preview).toContain('"averageMin": 410');
    expect(preview).not.toContain('PRIVATE-FOOD');
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await fireEvent.press(screen.getByText('Enviar'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body ?? '{}') as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages[1]).toEqual({ role: 'user', content: preview });
    expect(await screen.findByText('Duermes 6 h 50 min de media.')).toBeTruthy();
    expect(mockSettings.get('aiChat')).toHaveLength(2);
  });

  it('includes food notes only after the switch, and a change invalidates the preview', async () => {
    await wrap(<AskAiScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Tu pregunta'), '¿Y mi comida?');
    await act(async () => {
      await fireEvent.press(screen.getByText('Revisar qué se envía'));
    });
    expect(await screen.findByTestId('ai-preview-message')).toBeTruthy();
    await fireEvent(
      screen.getByLabelText('Incluir mis notas de comida en este mensaje'),
      'valueChange',
      true,
    );
    expect(screen.queryByTestId('ai-preview-message')).toBeNull();
    await act(async () => {
      await fireEvent.press(screen.getByText('Revisar qué se envía'));
    });
    const preview = (await screen.findByTestId('ai-preview-message')).props.children as string;
    expect(preview).toContain('PRIVATE-FOOD');
  });
});

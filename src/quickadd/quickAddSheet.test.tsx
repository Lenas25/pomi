import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';
import { QuickAddSheet } from './QuickAddSheet';

const mockSet = jest.fn(async () => undefined);
const mockSave = jest.fn(async () => undefined);

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../gym/useGym', () => ({ useGymTab: () => ({ status: 'loading' }) }));
jest.mock('../notifications/sync', () => ({ requestNotificationSync: jest.fn() }));
jest.mock('../db', () => ({
  getRepositories: () => ({
    habitLogs: { set: mockSet },
    foodNotes: { save: mockSave },
  }),
}));
jest.mock('./quickAdd', () => ({
  addGlassOfWater: jest.fn(),
  checkinKindAt: () => 'morning',
  loadQuickHabits: jest.fn(async () => ({
    checks: [{ habitId: 'pausa', name: 'Pausa activa', done: false }],
    food: { prompt: '¿Qué comiste hoy?', note: '' },
  })),
}));

beforeEach(() => {
  setLanguage('es');
  jest.clearAllMocks();
});

function renderSheet() {
  return render(
    <ThemeProvider mode="light">
      <QuickAddSheet visible onClose={() => undefined} />
    </ThemeProvider>,
  );
}

describe('QuickAddSheet in-place actions', () => {
  it('"Marcar un hábito" shows the checklist and marks a habit without navigating', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Marcar un hábito' }));
    const chip = await screen.findByLabelText(/Pausa activa/);
    await fireEvent.press(chip);
    expect(mockSet).toHaveBeenCalledWith('pausa', expect.any(String), 1);
    expect(jest.mocked(router.push)).not.toHaveBeenCalled();
  });

  it('"Nota de comida" saves the note in place', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Nota de comida' }));
    await fireEvent.changeText(await screen.findByLabelText('¿Qué comiste hoy?'), 'Ensalada');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar nota' }));
    expect(mockSave).toHaveBeenCalledWith(expect.any(String), 'Ensalada');
    expect(await screen.findByText('Nota guardada.')).toBeTruthy();
    expect(jest.mocked(router.push)).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useDataVersion } from '../db/dataVersion';
import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';
import { QuickAddSheet } from './QuickAddSheet';

const mockSet = jest.fn(async () => undefined);
const mockSave = jest.fn(async () => undefined);

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../notifications/sync', () => ({ requestNotificationSync: jest.fn() }));
jest.mock('../db', () => ({
  getRepositories: () => ({
    habitLogs: { set: mockSet },
    foodNotes: { save: mockSave },
  }),
}));
const mockMenu = jest.fn(async () => ({
  checkins: { morning: false, night: false },
  gymRoutineId: null as string | null,
}));
jest.mock('./quickAdd', () => ({
  addGlassOfWater: jest.fn(),
  checkinKindAt: jest.requireActual<typeof import('./quickAdd')>('./quickAdd').checkinKindAt,
  loadQuickMenu: () => mockMenu(),
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

  it('bumps the shared data version after a write so the hub underneath reloads', async () => {
    const before = useDataVersion.getState().version;
    await renderSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Marcar un hábito' }));
    await fireEvent.press(await screen.findByLabelText(/Pausa activa/));
    expect(useDataVersion.getState().version).toBe(before + 1);
  });

  it('shows the done state when both check-ins of today are answered', async () => {
    mockMenu.mockResolvedValueOnce({
      checkins: { morning: true, night: true },
      gymRoutineId: null,
    });
    await renderSheet();
    const row = await screen.findByRole('button', { name: 'Check-ins de hoy hechos' });
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('starts the routine the menu resolved', async () => {
    mockMenu.mockResolvedValueOnce({
      checkins: { morning: false, night: false },
      gymRoutineId: 'fullA',
    });
    await renderSheet();
    const row = screen.getByRole('button', { name: 'Iniciar sesión de gym' });
    await screen.findByRole('button', { name: 'Check-in' });
    await fireEvent.press(row);
    expect(jest.mocked(router.push)).toHaveBeenCalledWith({
      pathname: '/gym/session',
      params: { routineId: 'fullA' },
    });
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

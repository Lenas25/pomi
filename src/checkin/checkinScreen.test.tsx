import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';

import { loadCheckin, saveCheckin } from './checkinFlow';
import { CheckinScreen } from './CheckinScreen';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('../notifications/sync', () => ({ requestNotificationSync: jest.fn() }));
jest.mock('../db', () => ({ getDatabase: () => null, getRepositories: () => null }));
jest.mock('./checkinFlow', () => ({ loadCheckin: jest.fn(), saveCheckin: jest.fn() }));

beforeEach(() => {
  setLanguage('es');
  jest.clearAllMocks();
  jest.mocked(loadCheckin).mockResolvedValue({
    status: 'ready',
    plan: {
      kind: 'morning',
      questions: [
        { id: 'bed', type: 'time', label: '¿A qué hora te dormiste?', prefill: 'bed' },
        { id: 'wake', type: 'time', label: '¿A qué hora despertaste?', prefill: 'wake' },
        { id: 'quality', type: 'scale', label: '¿Cómo dormiste?', scale: [1, 5] },
      ],
      foodPrompt: null,
      answers: { bed: '23:50', wake: '07:00' },
      foodNote: '',
    },
  });
  jest.mocked(saveCheckin).mockResolvedValue({ ok: true });
});

async function renderScreen() {
  return render(
    <ThemeProvider mode="light">
      <CheckinScreen kind="morning" />
    </ThemeProvider>,
  );
}

describe('CheckinScreen', () => {
  it('steps Sueño -> Calidad -> Listo with a fixed back slot and a short summary', async () => {
    await renderScreen();
    const steps = await screen.findByTestId('checkin-steps');
    expect(steps.props.accessibilityLabel).toBe('Paso 1 de 3: Sueño');
    // First step: the back slot closes the check-in.
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeTruthy();
    expect(screen.getByText('23:50')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));

    expect(screen.getByTestId('checkin-steps').props.accessibilityLabel).toBe(
      'Paso 2 de 3: Calidad',
    );
    await fireEvent.press(screen.getByRole('radio', { name: '3 de 5, Bien' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));

    await waitFor(() => expect(screen.getByTestId('checkin-summary')).toBeTruthy());
    expect(screen.getByTestId('checkin-summary').props.children).toBe(
      'Dormiste 7 h 10 · calidad Bien',
    );
    expect(saveCheckin).toHaveBeenCalledWith(
      null,
      null,
      expect.anything(),
      expect.any(String),
      { bed: '23:50', wake: '07:00', quality: 3 },
      '',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('back on the second step returns to the first', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'Siguiente' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByTestId('checkin-steps').props.accessibilityLabel).toBe('Paso 1 de 3: Sueño');
    expect(router.back).not.toHaveBeenCalled();
  });
});

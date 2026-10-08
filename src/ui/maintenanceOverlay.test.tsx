import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useMaintenanceStore } from '../db/maintenance';
import { setLanguage } from '../i18n';

import {
  MAINTENANCE_HIDEABLE_MS,
  MAINTENANCE_SLOW_MS,
  MaintenanceOverlay,
} from './MaintenanceOverlay';
import { ThemeProvider } from './theme';

beforeEach(() => {
  setLanguage('es');
  jest.useFakeTimers();
  useMaintenanceStore.setState({ active: false, since: null });
});
afterEach(() => {
  jest.useRealTimers();
  useMaintenanceStore.setState({ active: false, since: null });
});

async function mount() {
  await render(
    <ThemeProvider mode="light">
      <MaintenanceOverlay />
    </ThemeProvider>,
  );
}

describe('MaintenanceOverlay', () => {
  it('covers the app while a restore runs and says so calmly when it is slow', async () => {
    await mount();
    expect(screen.queryByText('Restaurando tus datos')).toBeNull();

    await act(async () => useMaintenanceStore.setState({ active: true, since: Date.now() }));
    expect(screen.getByText('Un momento, no cierres la app.')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(MAINTENANCE_SLOW_MS);
    });
    expect(screen.getByText(/Está tardando más de lo normal/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ocultar este aviso' })).toBeNull();
  });

  it('lets the person hide it after the long timeout, and resets for the next run', async () => {
    await mount();
    await act(async () => useMaintenanceStore.setState({ active: true, since: Date.now() }));
    await act(async () => {
      jest.advanceTimersByTime(MAINTENANCE_HIDEABLE_MS);
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Ocultar este aviso' }));
    expect(screen.queryByText('Restaurando tus datos')).toBeNull();

    await act(async () => useMaintenanceStore.setState({ active: false, since: null }));
    await act(async () => useMaintenanceStore.setState({ active: true, since: Date.now() }));
    expect(screen.getByText('Restaurando tus datos')).toBeTruthy();
    expect(screen.getByText('Un momento, no cierres la app.')).toBeTruthy();
  });
});

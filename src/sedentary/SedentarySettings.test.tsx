import { fireEvent, render, screen } from '@testing-library/react-native';

import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';

import { resolveSedentaryConfig } from './runNudge';
import { SedentarySettings } from './SedentarySettings';
import { useSedentarySettings } from './useSedentarySettings';

jest.mock('./useSedentarySettings', () => ({ useSedentarySettings: jest.fn() }));
const mocked = jest.mocked(useSedentarySettings);

const update = jest.fn(async () => undefined);
const setEnabled = jest.fn(async () => undefined);

function mockSettings(stored: Parameters<typeof resolveSedentaryConfig>[0], notice = null) {
  mocked.mockReturnValue({ config: resolveSedentaryConfig(stored), notice, update, setEnabled });
}

function renderIt() {
  return render(
    <ThemeProvider mode="light">
      <SedentarySettings />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  setLanguage('es');
  jest.clearAllMocks();
});

describe('SedentarySettings', () => {
  it('is off by default, asks for Health Connect when turned on and is honest about being approximate', async () => {
    mockSettings(undefined);
    await renderIt();
    expect(screen.getByLabelText('Avisarme si llevo un rato sin moverme').props.value).toBe(false);
    expect(screen.getByText(/necesita conexión a internet/)).toBeTruthy();
    expect(screen.getByText(/nunca insiste/)).toBeTruthy();
    // The details only appear once it is on.
    expect(screen.queryByText('Máximo de avisos al día')).toBeNull();
    await fireEvent(
      screen.getByLabelText('Avisarme si llevo un rato sin moverme'),
      'valueChange',
      true,
    );
    expect(setEnabled).toHaveBeenCalledWith(true);
  });

  it('shows window, threshold, days and the daily cap when on, and saves a change', async () => {
    mockSettings({ enabled: true });
    await renderIt();
    expect(screen.getByText('Mirar los últimos')).toBeTruthy();
    expect(screen.getByText('Máximo de avisos al día')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: '120 minutos' }));
    expect(update).toHaveBeenCalledWith({ windowMin: 120 });
    // Saturday is off by default; tapping it adds it.
    await fireEvent.press(screen.getByRole('checkbox', { name: 'sábado' }));
    expect(update).toHaveBeenLastCalledWith({ days: [1, 2, 3, 4, 5, 6] });
  });

  it('"No llevo el celular cuando camino" turns the reminder off and says why', async () => {
    mockSettings({ enabled: true, noPhone: true });
    await renderIt();
    expect(screen.getByText(/no reflejan tu movimiento real/)).toBeTruthy();
    expect(screen.queryByText('Máximo de avisos al día')).toBeNull();
  });

  it('explains a refused permission without blame', async () => {
    mockSettings(undefined, 'denied' as never);
    await renderIt();
    expect(screen.getByText(/falta el permiso de Health Connect/)).toBeTruthy();
  });
});

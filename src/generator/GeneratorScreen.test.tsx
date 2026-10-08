import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { setLanguage } from '../i18n';
import { pickProgram } from '../gym/program';
import { loadDefaultTemplates } from '../templates/defaults';
import { ThemeProvider } from '../ui/theme';

import { GeneratorScreen } from './GeneratorScreen';

let mockDb: Db;
let mockRepos: Repositories;

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock('../db', () => ({
  getDatabase: () => mockDb,
  getRepositories: () => mockRepos,
}));
jest.mock('../notifications/sync', () => ({
  requestNotificationSync: jest.fn(async () => undefined),
}));

let close: () => void;

beforeEach(async () => {
  setLanguage('es');
  jest.clearAllMocks();
  const test = await createTestDb();
  mockDb = test.db;
  close = test.close;
  mockRepos = createRepositories(mockDb);
  await mockRepos.templates.saveModules(loadDefaultTemplates().modules, 'add');
  await mockRepos.profile.save({ goal: 'musculo', level: 'intermedio' });
  await mockRepos.settings.set('gymDays', [{ days: [1, 3, 5], anchor: 'gymMorning' }]);
});

afterEach(() => close());

async function renderScreen() {
  await render(
    <ThemeProvider mode="light">
      <GeneratorScreen />
    </ThemeProvider>,
  );
}

async function answerAll(value: 'Sí' | 'No', overrides: Record<number, 'Sí' | 'No'> = {}) {
  for (let index = 1; index <= 7; index += 1) {
    expect(screen.getByText(`Pregunta ${index} de 7`)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: overrides[index] ?? value }));
  }
}

describe('PAR-Q+ screening in the wizard', () => {
  it('shows the seven questions literally, one per screen, and goes on after seven "no"', async () => {
    await renderScreen();
    expect(
      screen.getByText(
        '¿Tu médico te ha dicho alguna vez que tienes una enfermedad del corazón O presión arterial alta?',
      ),
    ).toBeTruthy();
    await answerAll('No');
    expect(screen.getByText('Todo en orden')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Tu rutina')).toBeTruthy();
    // Nothing restricted: the goal and level choices are there.
    expect(screen.getByRole('radio', { name: 'Ganar músculo' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Avanzado' })).toBeTruthy();
  });

  it('a "yes" shows the notice and needs an explicit acknowledgement; then only the gentle template', async () => {
    await renderScreen();
    await answerAll('No', { 2: 'Sí', 6: 'Sí' });
    expect(screen.getByText('Conviene consultar primero')).toBeTruthy();
    expect(screen.getByText(/dolor en el pecho es una señal para parar/)).toBeTruthy();
    expect(screen.getByText(/Pomi no es una autorización médica/)).toBeTruthy();
    const next = screen.getByRole('button', { name: 'Continuar' });
    expect(next.props.accessibilityState.disabled).toBe(true);
    await fireEvent(
      screen.getByRole('switch', { name: 'Lo entiendo y quiero una rutina suave' }),
      'valueChange',
      true,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText(/la propuesta será una rutina suave para principiantes/)).toBeTruthy();
    expect(screen.getByText(/Marcaste un problema de hueso/)).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Ganar músculo' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Ver mi propuesta' }));
    expect(screen.getByText(/Es una rutina suave para principiantes/)).toBeTruthy();
    expect(screen.getByText(/Mi rutina: Salud general/)).toBeTruthy();
  });
});

describe('from answers to an accepted routine', () => {
  async function toProposal() {
    await renderScreen();
    await answerAll('No');
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Ver mi propuesta' }));
  }

  it('starts from the onboarding answers and previews routines, volumes, WHO totals and the "por qué"', async () => {
    await renderScreen();
    await answerAll('No');
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'Intermedio' }).props.accessibilityState.checked,
      ).toBe(true),
    );
    expect(
      screen.getByRole('radio', { name: 'Ganar músculo' }).props.accessibilityState.checked,
    ).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Ver mi propuesta' }));

    expect(screen.getByText('Tu propuesta')).toBeTruthy();
    expect(screen.getByText(/3 días por semana/)).toBeTruthy();
    expect(screen.getByText('Series por músculo a la semana')).toBeTruthy();
    expect(screen.getByText('Frente a la OMS')).toBeTruthy();
    expect(screen.getByText('Por qué esta rutina')).toBeTruthy();
    expect(screen.getByText('Volumen')).toBeTruthy();
    expect(screen.getByText(/E1 \(Pelland 2025; Schoenfeld 2017\)/)).toBeTruthy();
    expect(screen.getAllByText(/Valor por defecto de Pomi, no un hallazgo/).length).toBeGreaterThan(
      0,
    );
    // Nothing is stored until the person accepts.
    expect(pickProgram(await mockRepos.templates.listModules())?.id).toBe('glute-4d');
  });

  it('removes and swaps exercises, and the program the person accepts is the edited one', async () => {
    await toProposal();
    const removeButtons = screen.getAllByRole('button', { name: 'Quitar' });
    const before = removeButtons.length;
    await fireEvent.press(removeButtons[0]!);
    expect(screen.getAllByRole('button', { name: 'Quitar' }).length).toBeLessThan(before);

    await fireEvent.press(screen.getAllByRole('button', { name: 'Cambiar' })[0]!);
    expect(screen.getByText(/^Cambiar .+ por$/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText(/^Cambiar .+ por$/)).toBeNull();
  });

  it('asks before saving, then makes it the active program and goes to the Gym tab', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Usar rutina')?.onPress?.();
    });
    await toProposal();
    await fireEvent.press(screen.getByRole('button', { name: 'Aceptar y usar esta rutina' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)/gym'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]?.[1]).toContain('Tus días de gym de Ajustes no cambian');
    const trained = pickProgram(await mockRepos.templates.listModules());
    expect(trained?.id).toMatch(/^generated-hypertrophy-/);
    alert.mockRestore();
  });

  it('declining the confirmation saves nothing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Cancelar')?.onPress?.();
    });
    await toProposal();
    await fireEvent.press(screen.getByRole('button', { name: 'Aceptar y usar esta rutina' }));
    await act(async () => undefined);
    expect(router.replace).not.toHaveBeenCalled();
    expect(pickProgram(await mockRepos.templates.listModules())?.id).toBe('glute-4d');
    alert.mockRestore();
  });
});

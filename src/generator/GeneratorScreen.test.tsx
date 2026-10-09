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

import { useEditorStore } from '../editor/editorStore';
import { ProgramEditorScreen } from '../editor/ProgramEditorScreen';
import { localizedText } from '../templates/localized';
import { GeneratorScreen } from './GeneratorScreen';

let mockDb: Db;
let mockRepos: Repositories;

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: () => true,
  },
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
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
  return render(
    <ThemeProvider mode="light">
      <GeneratorScreen />
    </ThemeProvider>,
  );
}

async function answerAll(value: 'Sí' | 'No', overrides: Record<number, 'Sí' | 'No'> = {}) {
  // The seven questions are on one screen: each has its own Sí / No pair.
  for (let index = 1; index <= 7; index += 1) {
    const name = overrides[index] ?? value;
    await fireEvent.press(screen.getAllByRole('radio', { name })[index - 1]!);
  }
}

describe('PAR-Q+ screening in the wizard', () => {
  it('shows the seven questions literally on one screen and goes on after seven "no"', async () => {
    await renderScreen();
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy();
    expect(
      screen.getByText(
        '¿Tu médico te ha dicho alguna vez que tienes una enfermedad del corazón O presión arterial alta?',
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole('radio', { name: 'Sí' })).toHaveLength(7);
    // Continuar waits for every answer.
    expect(
      screen.getByRole('button', { name: 'Continuar' }).props.accessibilityState.disabled,
    ).toBe(true);
    await answerAll('No');
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Tu objetivo')).toBeTruthy();
    expect(screen.getByText('Paso 2 de 3')).toBeTruthy();
    // Nothing restricted: the goal and level choices are there (chips).
    expect(screen.getByRole('radio', { name: 'Ganar músculo' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Avanzado' })).toBeTruthy();
  });

  it('a "yes" shows the notice and needs an explicit acknowledgement; then only the gentle template', async () => {
    await renderScreen();
    await answerAll('No', { 1: 'Sí', 6: 'Sí' });
    expect(screen.getByText('Conviene consultar primero')).toBeTruthy();
    expect(screen.getByText(/Pomi no es una autorización médica/)).toBeTruthy();
    expect(screen.getByText(/con máquinas y tu propio cuerpo/)).toBeTruthy();
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
    expect(screen.getByTestId('proposal-plain').props.children).toMatch(
      /salud general · principiante$/,
    );
  });

  it.each([2, 7])(
    'a "yes" to question %i blocks the routine and offers no way to continue',
    async (question) => {
      await renderScreen();
      await answerAll('No', { [question]: 'Sí' });
      expect(screen.getByText('Primero, habla con un profesional')).toBeTruthy();
      expect(screen.getByText(/Pomi no crea una rutina ahora/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
      expect(screen.queryByRole('switch')).toBeNull();
      // Changing the answer lifts the block.
      await fireEvent.press(screen.getAllByRole('radio', { name: 'No' })[question - 1]!);
      expect(screen.queryByText('Primero, habla con un profesional')).toBeNull();
      expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy();
    },
  );
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
    // Plain summary first; the evidence is behind "Ver por qué".
    expect(screen.getByTestId('proposal-plain').props.children).toBe(
      '3 días · 60 min · ganar músculo · intermedio',
    );
    expect(screen.queryByText('Series por músculo a la semana')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Ver por qué' }));
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
    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull();
    const cards = screen.getAllByRole('button', { name: /ejercicios · ~\d+ min$/ });
    await fireEvent.press(cards[0]!);
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
    await fireEvent.press(screen.getByRole('button', { name: 'Usar esta rutina' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)/gym'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]?.[1]).toContain('Tus días de gym de Ajustes no cambian');
    const trained = pickProgram(await mockRepos.templates.listModules());
    expect(trained?.id).toBe('generated');
    alert.mockRestore();
  });

  it('declining the confirmation saves nothing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Cancelar')?.onPress?.();
    });
    await toProposal();
    await fireEvent.press(screen.getByRole('button', { name: 'Usar esta rutina' }));
    await act(async () => undefined);
    expect(router.replace).not.toHaveBeenCalled();
    expect(pickProgram(await mockRepos.templates.listModules())?.id).toBe('glute-4d');
    alert.mockRestore();
  });
});

describe('"Ajustar": the full editor on the draft', () => {
  async function toDraftEditor() {
    const generator = await renderScreen();
    await answerAll('No');
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Ver mi propuesta' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Ajustar' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/editar-programa'));
    await generator.unmount();
  }

  beforeEach(() => useEditorStore.getState().close());

  it('opens the generated program as a draft: nothing is stored yet', async () => {
    await toDraftEditor();
    const { source, state } = useEditorStore.getState();
    expect(source?.draft).toBe(true);
    expect(source?.module.id).toBe('gym-generated');
    expect(state?.program.routines.length).toBeGreaterThan(0);
    expect(pickProgram(await mockRepos.templates.listModules())?.id).toBe('glute-4d');
  });

  it('edits persist when the person uses the adjusted routine', async () => {
    await toDraftEditor();
    useEditorStore.getState().dispatch({ type: 'renameProgram', name: 'Mi rutina ajustada' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Usar rutina')?.onPress?.();
    });
    await render(
      <ThemeProvider mode="light">
        <ProgramEditorScreen />
      </ThemeProvider>,
    );
    expect(screen.getByText('Ajusta tu rutina')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Usar esta rutina' }));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/gym'));
    expect(alert).toHaveBeenCalledTimes(1);
    const trained = pickProgram(await mockRepos.templates.listModules());
    expect(trained?.id).toBe('generated');
    expect(localizedText(trained?.name ?? '', 'es')).toBe('Mi rutina ajustada');
    expect(useEditorStore.getState().state).toBeNull();
    alert.mockRestore();
  });

  it('going back discards the draft and stores nothing', async () => {
    await toDraftEditor();
    const view = await render(
      <ThemeProvider mode="light">
        <ProgramEditorScreen />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Volver a la propuesta' }));
    expect(router.back).toHaveBeenCalled();
    await view.unmount();
    expect(useEditorStore.getState().state).toBeNull();
    expect(pickProgram(await mockRepos.templates.listModules())?.id).toBe('glute-4d');
  });
});

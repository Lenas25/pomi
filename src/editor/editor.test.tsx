import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { pickProgram } from '../gym/program';
import { setLanguage } from '../i18n';
import { es } from '../i18n/es';
import { shareJsonFile } from '../backup/files';
import { importTemplateFromText } from '../templates/importer';
import { requestNotificationSync } from '../notifications/sync';
import { loadDefaultTemplates } from '../templates/defaults';
import { ThemeProvider } from '../ui/theme';

import { loadEditorSource, prepareSave, saveEdited } from './editorSource';
import { useEditorStore } from './editorStore';
import { ProgramEditorScreen } from './ProgramEditorScreen';
import { RoutineEditorScreen } from './RoutineEditorScreen';
import { StepEditorScreen } from './StepEditorScreen';

let mockDb: Db;
let mockRepos: Repositories;
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../db', () => ({
  getDatabase: () => mockDb,
  getRepositories: () => mockRepos,
}));
jest.mock('../notifications/sync', () => ({
  requestNotificationSync: jest.fn(async () => undefined),
}));
jest.mock('../backup/files', () => ({ shareJsonFile: jest.fn(async () => 'shared') }));

let close: () => void;

beforeEach(async () => {
  setLanguage('es');
  jest.clearAllMocks();
  useEditorStore.getState().close();
  const test = await createTestDb();
  mockDb = test.db;
  close = test.close;
  mockRepos = createRepositories(mockDb);
  await mockRepos.templates.saveModules(loadDefaultTemplates().modules, 'add');
});
afterEach(() => close());

async function openEditor() {
  const source = await loadEditorSource(mockRepos);
  if (!source) throw new Error('no program');
  useEditorStore.getState().open(source);
  return source;
}

const stepIds = (routineId: string) =>
  useEditorStore
    .getState()
    .state?.program.routines.find((r) => r.id === routineId)
    ?.steps.map((s) => s.id) ?? [];

function renderScreen(ui: React.ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

describe('RoutineEditorScreen', () => {
  it('reorders a step with the 48 dp buttons', async () => {
    await openEditor();
    mockParams = { routineId: 'd1' };
    await renderScreen(<RoutineEditorScreen />);
    const before = stepIds('d1');
    const name = useEditorStore.getState().state?.program.routines[0]?.steps[7]?.name ?? '';
    await fireEvent.press(screen.getByRole('button', { name: `Subir ${name}` }));
    const after = stepIds('d1');
    expect(after[6]).toBe(before[7]);
    expect(after[7]).toBe(before[6]);
  });

  it('warns that a step with history loses it, and removes it after confirming', async () => {
    await openEditor();
    const session = await mockRepos.workouts.createSession({
      programId: 'glute-4d',
      routineId: 'd1',
      date: '2026-10-01',
      startedAt: 1,
    });
    await mockRepos.workouts.logSet({
      sessionId: session,
      stepId: 'rdl',
      setIndex: 0,
      weightKg: 40,
      reps: 8,
      doneAt: 2,
    });
    await openEditor();
    mockParams = { routineId: 'd1' };
    await renderScreen(<RoutineEditorScreen />);
    const name =
      useEditorStore.getState().state?.program.routines[0]?.steps.find((s) => s.id === 'rdl')
        ?.name ?? '';
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    await fireEvent.press(screen.getByRole('button', { name: `Quitar ${name}` }));
    expect(alert.mock.calls[0]?.[1]).toContain('Tiene historial de series');
    expect(alert.mock.calls[0]?.[1]).toContain('dejará de mostrarse');
    expect(stepIds('d1')).not.toContain('rdl');
    alert.mockRestore();
  });

  it('adds a custom step of its own and opens its form', async () => {
    await openEditor();
    mockParams = { routineId: 'd2' };
    await renderScreen(<RoutineEditorScreen />);
    await fireEvent.changeText(screen.getByLabelText(es.editor.routine.customName), 'Cuello');
    await fireEvent.press(screen.getByRole('checkbox', { name: es.editor.routine.kind.wait }));
    await fireEvent.press(screen.getAllByRole('button', { name: es.editor.routine.addCustom })[0]!);
    expect(stepIds('d2')).toContain('custom-cuello');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/editar-paso',
      params: { routineId: 'd2', stepId: 'custom-cuello' },
    });
  });
});

describe('StepEditorScreen', () => {
  it('shows validation errors in Spanish and keeps the step id when saving', async () => {
    await openEditor();
    mockParams = { routineId: 'd1', stepId: 'rdl' };
    await renderScreen(<StepEditorScreen />);
    await fireEvent.changeText(screen.getByLabelText(es.editor.step.reps), 'mucho');
    await fireEvent.press(screen.getByRole('button', { name: es.editor.step.save }));
    expect(screen.getByText(es.editor.errors.repsInvalid)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText(es.editor.step.reps), '6–8');
    await fireEvent.changeText(screen.getByLabelText(es.editor.step.sets), '4');
    await fireEvent.press(screen.getByRole('button', { name: es.editor.step.save }));
    const step = useEditorStore
      .getState()
      .state?.program.routines[0]?.steps.find((s) => s.id === 'rdl');
    expect(step).toMatchObject({ id: 'rdl', type: 'sets', sets: 4, reps: '6–8' });
    expect(router.back).toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('stores the edited program through the import path with the same step ids', async () => {
    const source = await openEditor();
    useEditorStore
      .getState()
      .dispatch({ type: 'moveStep', routineId: 'd1', stepId: 'rdl', direction: -1 });
    const program = useEditorStore.getState().state?.program;
    if (!program) throw new Error('no state');
    const prepared = prepareSave(source, program);
    if (!prepared.ok) throw new Error('should be valid');
    await saveEdited(mockDb, mockRepos, prepared.items);
    const stored = pickProgram(await mockRepos.templates.listModules());
    const ids = stored?.routines[0]?.steps.map((s) => s.id) ?? [];
    expect(ids.indexOf('rdl')).toBe(ids.indexOf('ht-heavy') - 1);
    expect(requestNotificationSync).toHaveBeenCalledWith('dataChanged');
  });

  it('refuses an invalid program and saves nothing', async () => {
    const source = await openEditor();
    useEditorStore.getState().dispatch({ type: 'renameRoutine', routineId: 'd1', name: ' ' });
    const program = useEditorStore.getState().state?.program;
    if (!program) throw new Error('no state');
    const prepared = prepareSave(source, program);
    expect(prepared.ok).toBe(false);
  });

  it('the program screen asks before dropping history, then saves', async () => {
    await openEditor();
    const session = await mockRepos.workouts.createSession({
      programId: 'glute-4d',
      routineId: 'd1',
      date: '2026-10-01',
      startedAt: 1,
    });
    await mockRepos.workouts.logSet({
      sessionId: session,
      stepId: 'rdl',
      setIndex: 0,
      weightKg: 40,
      reps: 8,
      doneAt: 2,
    });
    await openEditor();
    useEditorStore.getState().dispatch({ type: 'removeStep', routineId: 'd1', stepId: 'rdl' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((button) => button.text === es.editor.saveImpact.confirm)?.onPress?.();
    });
    await renderScreen(<ProgramEditorScreen />);
    await fireEvent.press(screen.getByRole('button', { name: es.editor.save }));
    expect(alert.mock.calls[0]?.[0]).toBe(es.editor.saveImpact.title);
    await waitFor(async () => {
      const stored = pickProgram(await mockRepos.templates.listModules());
      expect(stored?.routines[0]?.steps.map((s) => s.id)).not.toContain('rdl');
    });
    alert.mockRestore();
  });

  it('exports the edited program as a JSON file the importer accepts', async () => {
    await openEditor();
    useEditorStore.getState().dispatch({ type: 'renameProgram', name: 'Mi programa' });
    await renderScreen(<ProgramEditorScreen />);
    await fireEvent.press(screen.getByRole('button', { name: es.editor.export }));
    await waitFor(() => expect(shareJsonFile).toHaveBeenCalledTimes(1));
    const [fileName, text] = (shareJsonFile as jest.Mock).mock.calls[0] as [string, string];
    expect(fileName).toMatch(/\.json$/);
    const result = importTemplateFromText(text);
    expect(result.ok).toBe(true);
    expect(text).toContain('Mi programa');
  });
});

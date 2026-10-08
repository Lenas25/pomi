import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { setLanguage } from '../i18n';
import type { PhotoFs } from '../photos/photoStore';
import { loadDefaultTemplates } from '../templates/defaults';
import { ThemeProvider } from '../ui/theme';

import { ComparisonScreen } from './ComparisonScreen';
import { MonthlyReviewScreen } from './MonthlyReviewScreen';

const mockEnv: { db: Db | null; repos: Repositories | null; files: Map<string, string> } = {
  db: null,
  repos: null,
  files: new Map(),
};
const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true };

jest.mock('expo-router', () => ({
  router: {
    back: () => mockRouter.back(),
    replace: (...args: unknown[]) => mockRouter.replace(...args),
    push: (...args: unknown[]) => mockRouter.push(...args),
    canGoBack: () => true,
  },
}));
jest.mock('../db', () => ({
  getDatabase: () => mockEnv.db,
  getRepositories: () => mockEnv.repos,
}));
jest.mock('../notifications/sync', () => ({ requestNotificationSync: jest.fn() }));
jest.mock('../photos/expoPhotoFs', () => ({
  expoPhotoFs: {
    store: async (source: string, name: string) => {
      mockEnv.files.set(name, `copy of ${source}`);
    },
    remove: (name: string) => void mockEnv.files.delete(name),
    exists: (name: string) => mockEnv.files.has(name),
    uriOf: (name: string) => `file:///photos/${name}`,
    list: () => [...mockEnv.files.keys()],
    size: () => 1,
    readBase64: async () => '',
    writeBase64: () => undefined,
  } satisfies PhotoFs,
}));
// The camera itself is covered by PhotoStep.test.tsx: here a stub drives the flow.
jest.mock('./PhotoStep', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Button } = require('../ui/Button') as typeof import('../ui/Button');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Text } = require('react-native') as typeof import('react-native');
  return {
    PhotoStep: (props: {
      pose: string;
      previous?: { uri: string };
      onUse: (uri: string) => Promise<void>;
      onSkipPose: () => void;
      onSkipAll: () => void;
    }) => (
      <View>
        <Text>{`pose:${props.pose}:${props.previous ? 'overlay' : 'none'}`}</Text>
        <Button label={`use ${props.pose}`} onPress={() => void props.onUse('cache://shot.jpg')} />
        <Button label={`skip ${props.pose}`} onPress={props.onSkipPose} />
        <Button label="skip all" onPress={props.onSkipAll} />
      </View>
    ),
  };
});

let close: () => void;

beforeEach(async () => {
  setLanguage('es');
  jest.clearAllMocks();
  const test = await createTestDb();
  close = test.close;
  mockEnv.db = test.db;
  mockEnv.repos = createRepositories(test.db);
  mockEnv.files = new Map();
  await mockEnv.repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
});
afterEach(() => close());

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

describe('MonthlyReviewScreen', () => {
  it('walks measurements and photos, saves everything and offers the comparison', async () => {
    const repos = mockEnv.repos!;
    await repos.photos.add({ date: '2020-01-01', pose: 'frente', uri: 'old.jpg' });
    mockEnv.files.set('old.jpg', 'x');
    await renderThemed(<MonthlyReviewScreen />);

    await screen.findByText('Revisión mensual');
    await fireEvent.press(screen.getByRole('button', { name: 'Empezar' }));
    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '61,5');
    await fireEvent.changeText(screen.getByLabelText('Cintura (cm)'), '70');
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));
    });

    // First pose: the earlier photo of the pose is passed as the overlay.
    expect(await screen.findByText('pose:Frente:overlay')).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'use Frente' }));
    });
    expect(await screen.findByText('pose:Perfil:none')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'skip Perfil' }));
    expect(await screen.findByText('pose:Espalda:none')).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'skip Espalda' }));
    });

    expect(await screen.findByText('Listo por este mes')).toBeTruthy();
    const today = (await repos.checkins.inRange('2000-01-01', '2999-12-31', 'monthly'))[0];
    expect(today?.answers).toEqual({ peso: 61.5, cintura: 70, photos: 1 });
    const photos = (await repos.photos.all()).filter((photo) => photo.uri !== 'old.jpg');
    expect(photos).toHaveLength(1);
    expect(photos[0]?.pose).toBe('frente');
    expect(mockEnv.files.get(photos[0]?.uri ?? '')).toBe('copy of cache://shot.jpg');

    await fireEvent.press(screen.getByRole('button', { name: /Ver «Tú hace 30 días vs\. hoy»/ }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/comparacion');
  });

  it('rejects a typo without saving, and every step can be skipped', async () => {
    const repos = mockEnv.repos!;
    await renderThemed(<MonthlyReviewScreen />);
    await screen.findByText('Revisión mensual');
    await fireEvent.press(screen.getByRole('button', { name: 'Empezar' }));
    await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), 'abc');
    await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Escribe un número, por ejemplo 61,5.')).toBeTruthy();
    expect(await repos.checkins.inRange('2000-01-01', '2999-12-31', 'monthly')).toEqual([]);

    await fireEvent.press(screen.getByRole('button', { name: 'Saltar' }));
    await screen.findByText(/pose:Frente/);
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'skip all' }));
    });
    expect(await screen.findByText('Listo por este mes')).toBeTruthy();
    const [review] = await repos.checkins.inRange('2000-01-01', '2999-12-31', 'monthly');
    expect(review?.answers).toEqual({ photos: 0 });
    expect(await repos.photos.all()).toEqual([]);
  });

  it('"Ahora no" leaves without saving anything', async () => {
    await renderThemed(<MonthlyReviewScreen />);
    await screen.findByText('Revisión mensual');
    await fireEvent.press(screen.getByRole('button', { name: 'Ahora no' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(await mockEnv.repos!.checkins.inRange('2000-01-01', '2999-12-31', 'monthly')).toEqual(
      [],
    );
  });
});

describe('ComparisonScreen', () => {
  it('is gentle and offers the review when there is nothing to compare', async () => {
    await renderThemed(<ComparisonScreen />);
    expect(await screen.findByText('Aún no hay con qué comparar')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Hacer la revisión del mes' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/revision-mensual');
  });

  it('compares measurements, photos and consistency from 30 days ago with today (no judgments)', async () => {
    const repos = mockEnv.repos!;
    const day = (offset: number) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    await repos.metrics.upsert('peso', day(31), 62);
    await repos.metrics.upsert('peso', day(2), 61);
    await repos.photos.add({ date: day(31), pose: 'frente', uri: 'then.jpg' });
    await repos.photos.add({ date: day(2), pose: 'frente', uri: 'now.jpg' });
    await repos.photos.add({ date: day(2), pose: 'perfil', uri: 'side.jpg' });
    mockEnv.files.set('then.jpg', 'x');
    mockEnv.files.set('now.jpg', 'x');
    mockEnv.files.set('side.jpg', 'x');

    await renderThemed(<ComparisonScreen />);
    expect(await screen.findByText('Peso: de 62 a 61 kg (-1)')).toBeTruthy();
    expect(screen.getByLabelText(/^Frente, Hace un mes \(/)).toBeTruthy();
    expect(screen.getByLabelText(/^Frente, Hoy \(/)).toBeTruthy();
    expect(screen.getByText(/Perfil: es tu primera foto/)).toBeTruthy();
    expect(
      screen.getByText(/Últimos 30 días: 0 sesiones de gym y 0 días con hábitos/),
    ).toBeTruthy();
    expect(screen.getByText('Aún no hay hallazgos este mes.')).toBeTruthy();
    expect(screen.queryByText(/mejor|peor|bajaste|subiste/i)).toBeNull();
  });
});

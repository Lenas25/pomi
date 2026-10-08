import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';

import { PhotosScreen, PHOTOS_PAGE_SIZE } from './PhotosScreen';

const mockEnv: { repos: Repositories | null; files: Map<string, string> } = {
  repos: null,
  files: new Map(),
};

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../db', () => ({ getRepositories: () => mockEnv.repos }));
jest.mock('./expoPhotoFs', () => ({
  expoPhotoFs: {
    remove: (name: string) => void mockEnv.files.delete(name),
    exists: (name: string) => mockEnv.files.has(name),
    uriOf: (name: string) => `file:///photos/${name}`,
    list: () => [...mockEnv.files.keys()],
  },
}));

let close: () => void;

beforeEach(async () => {
  setLanguage('es');
  const test = await createTestDb();
  close = test.close;
  mockEnv.repos = createRepositories(test.db);
  mockEnv.files = new Map();
});
afterEach(() => {
  close();
  jest.restoreAllMocks();
});

async function seed(count: number) {
  for (let index = 0; index < count; index += 1) {
    const day = String(index + 1).padStart(2, '0');
    await mockEnv.repos!.photos.add({ date: `2026-09-${day}`, pose: 'frente', uri: `p${day}.jpg` });
    mockEnv.files.set(`p${day}.jpg`, 'x');
  }
}

function renderScreen() {
  return render(
    <ThemeProvider mode="light">
      <PhotosScreen />
    </ThemeProvider>,
  );
}

describe('PhotosScreen', () => {
  it('shows a calm empty state without photos', async () => {
    await renderScreen();
    expect(await screen.findByText('Aún no hay fotos')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Borrar todas las fotos' })).toBeNull();
  });

  it('pages the photos and shows more on demand', async () => {
    await seed(PHOTOS_PAGE_SIZE + 2);
    await renderScreen();
    expect(await screen.findByText(`Fotos: ${PHOTOS_PAGE_SIZE + 2}`)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Frente, / })).toHaveLength(PHOTOS_PAGE_SIZE);

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Ver más' }));
    });
    expect(screen.getAllByRole('button', { name: /^Frente, / })).toHaveLength(PHOTOS_PAGE_SIZE + 2);
    expect(screen.queryByRole('button', { name: 'Ver más' })).toBeNull();
  });

  it('deletes every file and row after an explicit confirmation', async () => {
    await seed(3);
    mockEnv.files.set('stray.jpg', 'y');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'Borrar todas las fotos' }));

    const [title, body, buttons] = alert.mock.calls[0] as [string, string, AlertButton[]];
    expect(title).toBe('¿Borrar todas las fotos?');
    expect(body).toContain('3 fotos');
    // Nothing happens before the confirmation.
    expect(await mockEnv.repos!.photos.count()).toBe(3);

    await act(async () => {
      buttons.find((button) => button.style === 'destructive')?.onPress?.();
    });
    expect(await screen.findByText('Listo. Tus fotos fueron borradas.')).toBeTruthy();
    expect(await mockEnv.repos!.photos.count()).toBe(0);
    expect(mockEnv.files.size).toBe(0);
  });
});

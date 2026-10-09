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

const mockSavePhoto = jest.fn();
const mockTakePicture = jest.fn(async () => ({ uri: 'file:///cache/capture.jpg' }));

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('./photoStore', () => ({
  ...jest.requireActual<typeof import('./photoStore')>('./photoStore'),
  savePhoto: (input: unknown) => mockSavePhoto(input),
}));
jest.mock('expo-camera', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  const CameraView = React.forwardRef(function CameraViewMock(
    props: { onCameraReady?: () => void },
    ref: React.Ref<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: () => mockTakePicture() }));
    React.useEffect(() => props.onCameraReady?.(), [props]);
    return React.createElement(View, { testID: 'camera' });
  });
  return {
    CameraView,
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});
jest.mock('../db', () => ({ getRepositories: () => mockEnv.repos }));
jest.mock('./expoPhotoFs', () => ({
  expoPhotoFs: {
    remove: (name: string) => void mockEnv.files.delete(name),
    exists: (name: string) => mockEnv.files.has(name),
    uriOf: (name: string) => `file:///photos/${name}`,
    list: () => [...mockEnv.files.keys()],
    discard: jest.fn(),
  },
}));

let close: () => void;

beforeEach(async () => {
  setLanguage('es');
  const test = await createTestDb();
  close = test.close;
  mockEnv.repos = createRepositories(test.db);
  mockEnv.files = new Map();
  mockSavePhoto.mockReset();
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

  it('hides "Ver más" and fixes the count when a page comes back short', async () => {
    await seed(PHOTOS_PAGE_SIZE + 2);
    await renderScreen();
    expect(await screen.findByText(`Fotos: ${PHOTOS_PAGE_SIZE + 2}`)).toBeTruthy();
    // Two photos disappear elsewhere (a restore, another screen): the count read earlier is stale.
    const { photos } = mockEnv.repos!;
    const stale = await photos.pageAfter(PHOTOS_PAGE_SIZE + 2);
    await photos.removeMany(stale.slice(-2).map((row) => row.id));
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Ver más' }));
    });
    expect(screen.queryByRole('button', { name: 'Ver más' })).toBeNull();
    expect(screen.getByText(`Fotos: ${PHOTOS_PAGE_SIZE}`)).toBeTruthy();
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

  it('takes a photo: pick the pose, camera with the last photo as a ghost, save', async () => {
    await seed(1);
    mockSavePhoto.mockImplementation(async () => {
      await mockEnv.repos!.photos.add({ date: '2026-10-09', pose: 'perfil', uri: 'new.jpg' });
      mockEnv.files.set('new.jpg', 'x');
    });
    await renderScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'Tomar foto' }));
    expect(await screen.findByText('¿Qué pose?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Frente' }));
    expect(screen.getByTestId('camera')).toBeTruthy();
    // The last "frente" photo is drawn over the camera.
    expect(
      screen.getByTestId('previous-photo-overlay', { includeHiddenElements: true }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tomar foto' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Usar esta foto' }));
    expect(mockSavePhoto).toHaveBeenCalledWith(
      expect.objectContaining({ pose: 'frente', tempUri: 'file:///cache/capture.jpg' }),
    );
    expect(await screen.findByText('Foto guardada.')).toBeTruthy();
    expect(screen.getByText('Fotos: 2')).toBeTruthy();
  });

  it('cancel from the pose list goes back to the gallery', async () => {
    await renderScreen();
    expect(
      await screen.findByText('Toma tu primera foto para ver tu cambio con el tiempo.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tomar foto' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Aún no hay fotos')).toBeTruthy();
    expect(mockSavePhoto).not.toHaveBeenCalled();
  });
});

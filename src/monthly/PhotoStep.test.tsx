import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Linking } from 'react-native';

import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';

import { PhotoStep } from './PhotoStep';

type Permission = { granted: boolean; canAskAgain: boolean } | null;

let mockPermission: Permission = null;
const mockRequest = jest.fn();
const mockTakePicture = jest.fn();

jest.mock('expo-camera', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  const CameraView = React.forwardRef(function CameraViewMock(
    props: { onCameraReady?: () => void },
    ref: React.Ref<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: (options: unknown) => mockTakePicture(options),
    }));
    React.useEffect(() => props.onCameraReady?.(), [props]);
    return React.createElement(View, { testID: 'camera' });
  });
  return {
    CameraView,
    useCameraPermissions: () => [mockPermission, mockRequest],
  };
});

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

const baseProps = {
  pose: 'Frente',
  current: 1,
  total: 3,
  guide: 'Misma luz, misma hora.',
  onUse: jest.fn(async () => undefined),
  onSkipPose: jest.fn(),
  onSkipAll: jest.fn(),
};

beforeEach(() => {
  setLanguage('es');
  jest.clearAllMocks();
  mockPermission = { granted: true, canAskAgain: true };
});

describe('PhotoStep permission', () => {
  it('explains why the camera is needed before asking, and can be skipped', async () => {
    mockPermission = { granted: false, canAskAgain: true };
    await renderThemed(<PhotoStep {...baseProps} />);
    expect(screen.getByText('Necesitamos tu cámara')).toBeTruthy();
    expect(screen.getByText(/no en tu galería/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Permitir cámara' }));
    expect(mockRequest).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Seguir sin fotos' }));
    expect(baseProps.onSkipAll).toHaveBeenCalledTimes(1);
  });

  it('denied for good: points to the system settings and still lets the review continue', async () => {
    mockPermission = { granted: false, canAskAgain: false };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderThemed(<PhotoStep {...baseProps} />);
    expect(screen.getByText('La cámara está desactivada')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Permitir cámara' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Abrir ajustes' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Seguir sin fotos' }));
    expect(baseProps.onSkipAll).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });
});

describe('PhotoStep capture', () => {
  it('shows the pose, the guide and a first-photo note when there is no previous photo', async () => {
    await renderThemed(<PhotoStep {...baseProps} />);
    expect(screen.getByText('Foto 1 de 3: Frente')).toBeTruthy();
    expect(screen.getByText(/Misma luz, misma hora/)).toBeTruthy();
    expect(screen.getByText('Es tu primera foto de esta pose.')).toBeTruthy();
    expect(screen.getByTestId('camera')).toBeTruthy();
  });

  it('draws the previous photo faded over the camera (opacity token), hidden from TalkBack', async () => {
    await renderThemed(<PhotoStep {...baseProps} previous={{ uri: 'file:///prev.jpg' }} />);
    expect(screen.getByText(/en transparencia para alinear/)).toBeTruthy();
    const overlay = screen.getByTestId('previous-photo-overlay', { includeHiddenElements: true });
    expect(overlay.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(overlay.props.pointerEvents).toBe('none');
    expect(overlay.props.style.opacity).toBe(0.35);
  });

  it('takes a photo, lets the person retake it, then uses it', async () => {
    mockTakePicture.mockResolvedValue({ uri: 'file:///cache/a.jpg' });
    await renderThemed(<PhotoStep {...baseProps} />);
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Tomar foto' }));
    });
    expect(mockTakePicture).toHaveBeenCalledWith({ quality: 0.7 });
    expect(screen.getByRole('image', { name: 'Foto de Frente lista para revisar' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Repetir' }));
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Tomar foto' }));
    });
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Usar esta foto' }));
    });
    expect(baseProps.onUse).toHaveBeenCalledWith('file:///cache/a.jpg');
  });

  it('shows a readable error when the capture or the save fails, and keeps going', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockTakePicture.mockRejectedValueOnce(new Error('camera'));
    await renderThemed(<PhotoStep {...baseProps} />);
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Tomar foto' }));
    });
    expect(screen.getByText('No pudimos tomar la foto. Inténtalo de nuevo.')).toBeTruthy();

    mockTakePicture.mockResolvedValue({ uri: 'file:///cache/a.jpg' });
    baseProps.onUse.mockRejectedValueOnce(new Error('disk'));
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Tomar foto' }));
    });
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Usar esta foto' }));
    });
    expect(screen.getByText('No pudimos guardar la foto. Inténtalo de nuevo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Usar esta foto' })).toBeTruthy();
    logged.mockRestore();
  });

  it('skips a pose or all the photos', async () => {
    await renderThemed(<PhotoStep {...baseProps} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Saltar esta pose' }));
    expect(baseProps.onSkipPose).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Seguir sin fotos' }));
    expect(baseProps.onSkipAll).toHaveBeenCalledTimes(1);
  });
});

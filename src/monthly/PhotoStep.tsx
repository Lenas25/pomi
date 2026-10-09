// One pose of the monthly review: permission explanation, camera with the previous photo of the
// pose faded on top (to line the pose up), review of the capture, retake or skip. The camera is
// expo-camera (`CameraView`, `useCameraPermissions`, `takePictureAsync`), verified against the
// official docs for SDK 57.
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';

import { useT } from '../i18n';
import { Button } from '../ui/Button';
import { Mascot } from '../ui/Mascot';
import { useTheme } from '../ui/theme';

/** Quality of the capture (0-1): small enough to keep a year of photos reasonable, still sharp. */
const CAPTURE_QUALITY = 0.7;
/**
 * Explicit on purpose: the capture must carry NO EXIF (no GPS position, no device data). The
 * documented default is already `false`, but the privacy promise should not depend on a default.
 */
const CAPTURE_OPTIONS = { quality: CAPTURE_QUALITY, exif: false } as const;

type PhotoStepProps = {
  /** Display name of the pose. */
  pose: string;
  current: number;
  total: number;
  guide?: string | undefined;
  /** The previous photo of this pose, drawn at `opacity.overlay` over the preview. */
  previous?: { uri: string } | undefined;
  /** Receives the cache file of the capture; throw to show the save error. */
  onUse: (tempUri: string) => Promise<void>;
  /** Deletes a capture (camera cache file) that will not be stored: retake, skip, leaving. */
  onDiscard?: ((tempUri: string) => void) | undefined;
  onSkipPose: () => void;
  /** Leaves the photos; without it (a single photo from the gallery) the button is hidden. */
  onSkipAll?: (() => void) | undefined;
  /** Label of the "skip this pose" button (the gallery says "Cancelar"). */
  skipPoseLabel?: string | undefined;
  /** Header override (the gallery shows just the pose). */
  title?: string | undefined;
};

export function PhotoStep({
  pose,
  current,
  total,
  guide,
  previous,
  onUse,
  onDiscard,
  onSkipPose,
  onSkipAll,
  skipPoseLabel,
  title,
}: PhotoStepProps) {
  const t = useT();
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The capture that still sits in the camera cache; cleared once it is stored or discarded.
  const pending = useRef<string | null>(null);
  const mounted = useRef(true);
  const discard = useRef(onDiscard);
  useEffect(() => {
    discard.current = onDiscard;
  });

  const dropCapture = () => {
    const uri = pending.current;
    pending.current = null;
    if (uri !== null) discard.current?.(uri);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dropCapture();
    };
  }, []);

  const muted = [theme.text('caption'), { color: theme.color.textMuted }];
  const frame = {
    width: '100%' as const,
    aspectRatio: theme.photo.aspect,
    borderRadius: theme.radius.lg,
    overflow: 'hidden' as const,
    backgroundColor: theme.color.border,
  };

  if (permission === null) return null;

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <View style={{ gap: theme.space[4], alignItems: 'center' }}>
        <Mascot pose="mide" size="md" />
        <Text
          accessibilityRole="header"
          style={[theme.text('title-md'), { color: theme.color.text, textAlign: 'center' }]}
        >
          {blocked ? t('monthly.photos.deniedTitle') : t('monthly.photos.permissionTitle')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted, textAlign: 'center' }]}>
          {blocked ? t('monthly.photos.deniedBody') : t('monthly.photos.permissionBody')}
        </Text>
        {blocked ? (
          <Button
            label={t('monthly.photos.openSettings')}
            onPress={() => void Linking.openSettings()}
          />
        ) : (
          <Button label={t('monthly.photos.allow')} onPress={() => void requestPermission()} />
        )}
        <Button
          label={
            onSkipAll
              ? t('monthly.photos.skipAll')
              : (skipPoseLabel ?? t('monthly.photos.skipPose'))
          }
          variant="ghost"
          onPress={onSkipAll ?? onSkipPose}
        />
      </View>
    );
  }

  const capture = async () => {
    setError(null);
    setBusy(true);
    try {
      const picture = await camera.current?.takePictureAsync(CAPTURE_OPTIONS);
      if (picture) {
        if (!mounted.current) {
          // The person left while the camera was working: nobody will use this file.
          discard.current?.(picture.uri);
          return;
        }
        pending.current = picture.uri;
        setCaptured(picture.uri);
      }
    } catch (failure) {
      if (__DEV__) console.error('Could not take the photo', failure);
      setError(t('monthly.photos.captureFailed'));
    } finally {
      setBusy(false);
    }
  };

  const use = async () => {
    if (captured === null) return;
    setError(null);
    setBusy(true);
    try {
      await onUse(captured);
      // Stored: the store already removed the cache file.
      pending.current = null;
    } catch (failure) {
      if (__DEV__) console.error('Could not save the photo', failure);
      setError(t('monthly.photos.saveFailed'));
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: theme.space[3] }}>
      <Text
        accessibilityRole="header"
        style={[theme.text('title-md'), { color: theme.color.text }]}
      >
        {title ?? t('monthly.photos.step', { current, total, pose })}
      </Text>

      {captured === null ? (
        <View
          accessible
          accessibilityLabel={t('monthly.photos.cameraLabel', { pose })}
          style={frame}
        >
          <CameraView
            ref={camera}
            style={{ flex: 1 }}
            facing={facing}
            ratio="4:3"
            onCameraReady={() => setReady(true)}
          />
          {previous ? (
            <View
              testID="previous-photo-overlay"
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: theme.opacity.overlay,
              }}
            >
              <Image source={{ uri: previous.uri }} resizeMode="cover" style={{ flex: 1 }} />
            </View>
          ) : null}
        </View>
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('monthly.photos.previewLabel', { pose })}
          style={frame}
        >
          <Image source={{ uri: captured }} resizeMode="cover" style={{ flex: 1 }} />
        </View>
      )}

      <Text style={muted}>
        {previous ? t('monthly.photos.overlay') : t('monthly.photos.firstPhoto')}
      </Text>
      {guide ? <Text style={muted}>{`${t('monthly.photos.guideTitle')}: ${guide}`}</Text> : null}

      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.text('body'), { color: theme.color.error }]}
        >
          {error}
        </Text>
      ) : null}

      {captured === null ? (
        <>
          <Button
            label={t('monthly.photos.shutter')}
            onPress={() => void capture()}
            loading={busy}
            disabled={!ready}
          />
          <Button
            label={t('monthly.photos.flip')}
            variant="secondary"
            onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
            disabled={busy}
          />
        </>
      ) : (
        <>
          <Button label={t('monthly.photos.use')} onPress={() => void use()} loading={busy} />
          <Button
            label={t('monthly.photos.retake')}
            variant="secondary"
            onPress={() => {
              dropCapture();
              setCaptured(null);
              setError(null);
            }}
            disabled={busy}
          />
        </>
      )}
      <Button
        label={skipPoseLabel ?? t('monthly.photos.skipPose')}
        variant="ghost"
        onPress={() => {
          dropCapture();
          onSkipPose();
        }}
        disabled={busy}
      />
      {onSkipAll ? (
        <Button
          label={t('monthly.photos.skipAll')}
          variant="ghost"
          onPress={() => {
            dropCapture();
            onSkipAll();
          }}
          disabled={busy}
        />
      ) : null}
    </View>
  );
}

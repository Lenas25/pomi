import { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { useT } from '../i18n';
import { useTheme } from '../ui/theme';

import { expoPhotoFs } from './expoPhotoFs';
import { ensureThumbnail, thumbnailName } from './photoStore';

type StoredPhotoProps = {
  /** File name in the private photo folder (`photos.uri`). */
  name: string;
  /** Spoken description, e.g. "Frente, 1/10". */
  label: string;
  /** Grids: show the small thumbnail (full photo if missing, created in the background). */
  thumbnail?: boolean;
};

/** A stored photo at the photo aspect ratio; a calm placeholder when the file is not on this phone. */
export function StoredPhoto({ name, label, thumbnail = false }: StoredPhotoProps) {
  const theme = useTheme();
  const t = useT();
  // Bumped when a lazy backfill finishes, so the file checks run again once.
  const [backfilled, setBackfilled] = useState(0);
  const { available, shownName } = useMemo(() => {
    const exists = expoPhotoFs.exists(name);
    const thumb = thumbnailName(name);
    return {
      available: exists,
      shownName: exists && thumbnail && expoPhotoFs.exists(thumb) ? thumb : name,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, thumbnail, backfilled]);
  const needsBackfill = available && thumbnail && shownName === name;

  useEffect(() => {
    if (!needsBackfill) return;
    let cancelled = false;
    void ensureThumbnail(expoPhotoFs, name).then((made) => {
      if (made && !cancelled) setBackfilled((value) => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [needsBackfill, name]);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={available ? label : `${label}. ${t('progress.photos.unavailable')}`}
      style={{
        width: '100%',
        aspectRatio: theme.photo.aspect,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        backgroundColor: theme.color.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {available ? (
        <Image
          source={{ uri: expoPhotoFs.uriOf(shownName) }}
          resizeMode="cover"
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <Text
          style={[theme.text('caption'), { color: theme.color.textMuted, textAlign: 'center' }]}
        >
          {t('progress.photos.unavailable')}
        </Text>
      )}
    </View>
  );
}

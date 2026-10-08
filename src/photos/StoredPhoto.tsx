import { Image, Text, View } from 'react-native';

import { useT } from '../i18n';
import { useTheme } from '../ui/theme';

import { expoPhotoFs } from './expoPhotoFs';

type StoredPhotoProps = {
  /** File name in the private photo folder (`photos.uri`). */
  name: string;
  /** Spoken description, e.g. "Frente, 1/10". */
  label: string;
};

/** A stored photo at the photo aspect ratio; a calm placeholder when the file is not on this phone. */
export function StoredPhoto({ name, label }: StoredPhotoProps) {
  const theme = useTheme();
  const t = useT();
  const available = expoPhotoFs.exists(name);
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
          source={{ uri: expoPhotoFs.uriOf(name) }}
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

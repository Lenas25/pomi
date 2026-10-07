import { Image } from 'react-native';

import { mascotImages, type MascotPose } from './assets';
import { useTheme } from './theme';

export type MascotSize = 'sm' | 'md' | 'lg';

type MascotProps = { pose: MascotPose; size?: MascotSize };

/** Decorative Pomi illustration. Hidden from screen readers by design (HANDOFF §9). */
export function Mascot({ pose, size = 'md' }: MascotProps) {
  const theme = useTheme();
  const dimension = theme.mascot[size];
  return (
    <Image
      source={mascotImages[pose]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: dimension, height: dimension }}
      resizeMode="contain"
    />
  );
}

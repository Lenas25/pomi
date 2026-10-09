import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Icon } from 'phosphor-react-native';

import { useTheme, type SectionKey } from './theme';
import { usePressScale } from './usePressScale';

type BentoTileProps = {
  section: SectionKey;
  /** `tint` (default): soft section surface. `hero`: the section fill with navy text. */
  variant?: 'tint' | 'hero';
  icon?: Icon;
  title: string;
  /** The big number / status ("6/8", "Hecho"). */
  value?: string;
  /** One short line under the value. */
  caption?: string;
  /** Optional mini visual (ring, sparkline, dots); decorative, summarized by the label. */
  visual?: ReactNode;
  /** Spoken summary of the tile: title + value + what opening it does. */
  accessibilityLabel: string;
  /** Opens the detail page. */
  onPress: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A bento tile: compact summary of one area that opens its detail page. Fills its grid cell. */
export function BentoTile({
  section,
  variant = 'tint',
  icon: TileIcon,
  title,
  value,
  caption,
  visual,
  accessibilityLabel,
  onPress,
}: BentoTileProps) {
  const theme = useTheme();
  const press = usePressScale(theme.motion.pressScale.card);
  const colors = theme.section[section];
  const hero = variant === 'hero';
  const accent = hero ? colors.onFill : colors.text;
  const strong = hero ? colors.onFill : theme.color.text;
  const muted = hero ? colors.onFill : theme.color.textMuted;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        {
          flex: 1,
          minHeight: theme.touch.gym,
          overflow: 'hidden',
          borderRadius: theme.radius.lg,
          padding: theme.space[4],
          gap: theme.space[1],
          backgroundColor: hero ? colors.fill : colors.soft,
        },
        press.animatedStyle,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
        {TileIcon ? <TileIcon weight="fill" color={accent} /> : null}
        <Text numberOfLines={1} style={[theme.text('body-strong'), { color: accent, flex: 1 }]}>
          {title}
        </Text>
      </View>
      {value !== undefined ? (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[theme.text('metric-sm'), { color: strong }]}
        >
          {value}
        </Text>
      ) : null}
      {caption ? (
        <Text numberOfLines={2} style={[theme.text('caption'), { color: muted }]}>
          {caption}
        </Text>
      ) : null}
      {visual ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          {visual}
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

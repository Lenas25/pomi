import type { ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Icon } from 'phosphor-react-native';

import { tileMinHeight } from './bentoLayout';
import { useTheme, type SectionKey, type Theme } from './theme';
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
  /**
   * Optional quick action (e.g. "+1 vaso"): a separate 48 dp button in the bottom-right corner,
   * a sibling of the tile (never nested), so both are reachable with a screen reader.
   */
  action?: TileAction | undefined;
};

export type TileAction = {
  icon: Icon;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
};

/** The caption ellipsizes after this many lines. */
const CAPTION_LINES = 2;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Colors of the quick action button. On a tint tile the button is the section text color with a
 * surface icon (the section fill on its soft tint is under 3:1 in light mode); on a hero tile it
 * is navy with a fill-colored icon. Both meet 3:1 for the boundary and the icon (tested).
 */
export function tileActionColors(
  theme: Theme,
  section: SectionKey,
  variant: 'tint' | 'hero',
): { tile: string; background: string; icon: string } {
  const colors = theme.section[section];
  return variant === 'hero'
    ? { tile: colors.fill, background: colors.onFill, icon: colors.fill }
    : { tile: colors.soft, background: colors.text, icon: theme.color.surface };
}

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
  action,
}: BentoTileProps) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const press = usePressScale(theme.motion.pressScale.card);
  const colors = theme.section[section];
  const hero = variant === 'hero';
  const accent = hero ? colors.onFill : colors.text;
  const strong = hero ? colors.onFill : theme.color.text;
  const muted = hero ? colors.onFill : theme.color.textMuted;
  const actionColors = tileActionColors(theme, section, variant);
  const minHeight = Math.max(
    theme.touch.gym,
    tileMinHeight(
      { value: value !== undefined, caption: Boolean(caption) },
      {
        padding: theme.space[4],
        gap: theme.space[1],
        titleLine: theme.text('body-strong').lineHeight ?? 0,
        valueLine: theme.text('metric-sm').lineHeight ?? 0,
        captionLine: theme.text('caption').lineHeight ?? 0,
        captionMaxLines: CAPTION_LINES,
      },
      fontScale,
    ),
  );

  const tile = (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        {
          // Grow from the content (basis auto), never `flex: 1` (basis 0), which let the row stop
          // at its minimum height and cut the caption.
          flexGrow: 1,
          minHeight,
          borderRadius: theme.radius.lg,
          padding: theme.space[4],
          paddingRight: action ? theme.touch.gym + theme.space[4] : theme.space[4],
          gap: theme.space[1],
          backgroundColor: actionColors.tile,
        },
        press.animatedStyle,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
        {TileIcon ? <TileIcon weight="fill" color={accent} /> : null}
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[theme.text('body-strong'), { color: accent, flex: 1 }]}
        >
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
        <Text
          numberOfLines={CAPTION_LINES}
          ellipsizeMode="tail"
          style={[theme.text('caption'), { color: muted }]}
        >
          {caption}
        </Text>
      ) : null}
      {visual ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{ flexGrow: 1, justifyContent: 'flex-end' }}
        >
          {visual}
        </View>
      ) : null}
    </AnimatedPressable>
  );
  if (!action) return tile;
  const ActionIcon = action.icon;
  return (
    <View style={{ flexGrow: 1 }}>
      {tile}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action.accessibilityLabel}
        accessibilityState={{ disabled: action.disabled ?? false }}
        disabled={action.disabled}
        onPress={action.onPress}
        hitSlop={theme.space[1]}
        style={({ pressed }) => ({
          position: 'absolute',
          right: theme.space[3],
          bottom: theme.space[3],
          width: theme.touch.gym,
          height: theme.touch.gym,
          borderRadius: theme.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: actionColors.background,
          opacity: action.disabled ? theme.opacity.disabled : pressed ? theme.opacity.pressed : 1,
        })}
      >
        <ActionIcon weight="bold" color={actionColors.icon} />
      </Pressable>
    </View>
  );
}

import type { ComponentType, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CaretRight, type IconProps } from 'phosphor-react-native';

import { useTheme } from './theme';

type SettingsRowProps = {
  icon: ComponentType<IconProps>;
  title: string;
  /** One line with the current value ("07:00 · 3 días de gym"); cut with an ellipsis if long. */
  value?: string;
  onPress: () => void;
};

/** One Ajustes entry: icon + title + a one-line summary of its value, opening its own page. */
export function SettingsRow({ icon: Icon, title, value, onPress }: SettingsRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}. ${value}` : title}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch.gym,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        paddingHorizontal: theme.space[4],
        paddingVertical: theme.space[3],
        opacity: pressed ? theme.opacity.pressed : 1,
      })}
    >
      <Icon color={theme.color.text} />
      <View style={{ flex: 1 }}>
        <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>{title}</Text>
        {value ? (
          <Text numberOfLines={1} style={[theme.text('caption'), { color: theme.color.textMuted }]}>
            {value}
          </Text>
        ) : null}
      </View>
      <CaretRight color={theme.color.textMuted} />
    </Pressable>
  );
}

type SettingsGroupProps = {
  title: string;
  children: ReactNode;
};

/** A titled card holding a few `SettingsRow`s. */
export function SettingsGroup({ title, children }: SettingsGroupProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.text('title-sm'), { color: theme.color.textMuted }]}
      >
        {title}
      </Text>
      <View
        style={{
          borderRadius: theme.radius.lg,
          borderWidth: theme.stroke.hairline,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

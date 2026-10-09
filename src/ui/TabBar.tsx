import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Plus } from 'phosphor-react-native';

import { SECTION_ICONS } from './sections';
import { useTheme, type SectionKey, type Theme } from './theme';

export type TabBarTab = { name: string; section: SectionKey; label: string };

type TabBarProps = {
  /** Exactly the visible tabs, in order; the action sits in the middle. */
  tabs: readonly TabBarTab[];
  /** Name of the focused route; a route that is not a tab (Ajustes) highlights nothing. */
  activeName: string | undefined;
  onSelect: (name: string) => void;
  actionLabel: string;
  onAction: () => void;
  /** Bottom safe-area inset (gesture bar). */
  insetBottom: number;
};

/**
 * Active tab pill. Dark mode: the section fill with the sand `onFill` icon (the dark `soft`
 * tints sit too close to the bar). Light mode: the soft tint with the
 * section text color. Both keep the icon at >= 4.5:1 on its pill (tested).
 */
export function tabPillColors(
  theme: Theme,
  section: SectionKey,
): { background: string; icon: string } {
  const colors = theme.section[section];
  return theme.mode === 'dark'
    ? { background: colors.fill, icon: colors.onFill }
    : { background: colors.soft, icon: colors.text };
}

/**
 * Tab bar: 4 tabs + a raised center action. Active tab = filled icon in the section
 * color pill (`tabPillColors`) + label in the section text color; inactive = regular icon and label in
 * `textMuted` (≥ 4.5:1). Labels stay on one line and shrink a little instead of clipping at 1.3×.
 */
export function TabBar({
  tabs,
  activeName,
  onSelect,
  actionLabel,
  onAction,
  insetBottom,
}: TabBarProps) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  // HANDOFF §2: `layout.tabBarHeight` grows with the system font scale so labels never clip.
  const barHeight = Math.round(theme.layout.tabBarHeight * Math.max(1, fontScale));
  const half = Math.ceil(tabs.length / 2);

  const renderTab = (tab: TabBarTab) => {
    const focused = tab.name === activeName;
    const colors = theme.section[tab.section];
    const pill = tabPillColors(theme, tab.section);
    const TabIcon = SECTION_ICONS[tab.section];
    return (
      <Pressable
        key={tab.name}
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected: focused }}
        onPress={() => onSelect(tab.name)}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.space[1],
          minHeight: theme.touch.gym,
        }}
      >
        <View
          testID={focused ? `tab-pill-${tab.name}` : undefined}
          style={{
            width: theme.layout.tabPillWidth,
            height: theme.layout.tabPillHeight,
            borderRadius: theme.radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: focused ? pill.background : theme.color.transparent,
          }}
        >
          <TabIcon
            weight={focused ? 'fill' : 'regular'}
            color={focused ? pill.icon : theme.color.textMuted}
          />
        </View>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[
            theme.text('caption'),
            {
              color: focused ? colors.text : theme.color.textMuted,
              paddingHorizontal: theme.space[1],
            },
          ]}
        >
          {tab.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      accessibilityRole="tablist"
      style={{
        height: barHeight + insetBottom,
        paddingBottom: insetBottom,
        backgroundColor: theme.color.tabBar,
        borderTopWidth: theme.stroke.hairline,
        borderTopColor: theme.color.border,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {tabs.slice(0, half).map(renderTab)}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => ({
            width: theme.layout.tabActionSize,
            height: theme.layout.tabActionSize,
            borderRadius: theme.radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.color.energyFill,
            // Raised: overlaps the top edge, ringed in the bar color so it reads as cut out.
            marginTop: -theme.space[4],
            borderWidth: theme.stroke.accent,
            borderColor: theme.color.tabBar,
            opacity: pressed ? theme.opacity.pressed : 1,
            ...theme.shadow.raised,
          })}
        >
          <Plus weight="bold" color={theme.color.onEnergy} />
        </Pressable>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          importantForAccessibility="no"
          accessible={false}
          style={[theme.text('caption'), { color: theme.color.text }]}
        >
          {actionLabel}
        </Text>
      </View>
      {tabs.slice(half).map(renderTab)}
    </View>
  );
}

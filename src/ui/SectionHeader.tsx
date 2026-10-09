import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, GearSix } from 'phosphor-react-native';

import { useT } from '../i18n';
import { SECTION_ICONS } from './sections';
import { useTheme, type SectionKey } from './theme';

type SectionHeaderProps = {
  section: SectionKey;
  title: string;
  /** One short line under the title (identity phrase, program name, screen hint). */
  subtitle?: string | undefined;
  /** Optional summary slot (chips, a number) under the subtitle. Text inside uses `section.onFill`. */
  children?: ReactNode;
  /** The Ajustes gear (Ajustes is not a tab). Default `true`. */
  showSettings?: boolean;
  /** Detail pages: a 48 dp back button replaces the section icon. */
  back?: { label: string; onPress: () => void } | undefined;
};

/**
 * Calm section header: a subtle section tint that runs under the status bar, with the section icon
 * in the section accent (≥ 3:1 on the tint), the title and the subtitle in `onFill` (graphite in
 * light, sand in dark; ≥ 4.5:1, tested) and the Ajustes gear on the right. The tint follows the
 * mode, so the status bar keeps the app-wide style set in the root layout.
 */
export function SectionHeader({
  section,
  title,
  subtitle,
  children,
  showSettings = true,
  back,
}: SectionHeaderProps) {
  const theme = useTheme();
  const t = useT();
  const colors = theme.section[section];
  const SectionIcon = SECTION_ICONS[section];

  return (
    <View
      testID={`section-header-${section}`}
      style={{
        backgroundColor: colors.fill,
        borderBottomLeftRadius: theme.radius.xl,
        borderBottomRightRadius: theme.radius.xl,
      }}
    >
      <SafeAreaView edges={['top', 'left', 'right']}>
        <View
          style={{
            width: '100%',
            maxWidth: theme.layout.maxContentWidth,
            alignSelf: 'center',
            paddingHorizontal: theme.space[5],
            paddingTop: theme.space[2],
            paddingBottom: theme.space[5],
            gap: theme.space[1],
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            {back ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={back.label}
                onPress={back.onPress}
                style={({ pressed }) => ({
                  width: theme.touch.gym,
                  height: theme.touch.gym,
                  marginLeft: -theme.space[3],
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? theme.opacity.pressed : 1,
                })}
              >
                <ArrowLeft color={colors.onFill} />
              </Pressable>
            ) : (
              <SectionIcon weight="fill" color={colors.text} />
            )}
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              style={[theme.text('title-lg'), { color: colors.onFill, flex: 1 }]}
            >
              {title}
            </Text>
            {showSettings ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('tabs.ajustes')}
                onPress={() => router.push('/ajustes')}
                style={({ pressed }) => ({
                  width: theme.touch.gym,
                  height: theme.touch.gym,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? theme.opacity.pressed : 1,
                })}
              >
                <GearSix color={colors.onFill} />
              </Pressable>
            ) : null}
          </View>
          {subtitle ? (
            <Text style={[theme.text('body-strong'), { color: colors.onFill }]}>{subtitle}</Text>
          ) : null}
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}

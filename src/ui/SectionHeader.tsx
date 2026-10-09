import { useCallback, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GearSix } from 'phosphor-react-native';

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
};

/**
 * Pomi Splash section header: a block in the section color that runs under the status bar, with
 * the section icon, the title and the subtitle in navy (≥ 5.7:1 on every section fill), and the
 * Ajustes gear on the right. While focused it switches the status bar to dark icons.
 */
export function SectionHeader({
  section,
  title,
  subtitle,
  children,
  showSettings = true,
}: SectionHeaderProps) {
  const theme = useTheme();
  const t = useT();
  const colors = theme.section[section];
  const SectionIcon = SECTION_ICONS[section];

  useFocusEffect(
    useCallback(() => {
      // Navy text on a light fill needs dark status bar icons, in light AND dark mode.
      setStatusBarStyle('dark');
      return () => setStatusBarStyle(theme.mode === 'dark' ? 'light' : 'dark');
    }, [theme.mode]),
  );

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
            <SectionIcon weight="fill" color={colors.onFill} />
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

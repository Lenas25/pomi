import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useLocaleStore, useT } from '../src/i18n';
import {
  LANGUAGE_LABELS,
  LANGUAGE_OPTIONS,
  THEME_LABELS,
  THEME_OPTIONS,
} from '../src/settings/appearance';
import { SettingsPage } from '../src/settings/SettingsPage';
import { Card } from '../src/ui/Card';
import { OptionRow } from '../src/ui/OptionRow';
import { useTheme } from '../src/ui/theme';
import { useThemeModeStore } from '../src/ui/themeModeStore';

/** Ajustes > Apariencia: theme and language (both persisted by their stores). */
export default function Apariencia() {
  const t = useT();
  const theme = useTheme();
  const mode = useThemeModeStore((state) => state.mode);
  const setMode = useThemeModeStore((state) => state.setMode);
  const preference = useLocaleStore((state) => state.preference);
  const setPreference = useLocaleStore((state) => state.setPreference);

  const group = (title: string, children: ReactNode) => (
    <Card>
      <View accessibilityRole="radiogroup" style={{ gap: theme.space[2] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-sm'), { color: theme.color.text }]}
        >
          {title}
        </Text>
        {children}
      </View>
    </Card>
  );

  return (
    <SettingsPage title={t('settings.appearance.title')}>
      {group(
        t('settings.appearance.theme'),
        THEME_OPTIONS.map((option) => (
          <OptionRow
            key={option}
            label={t(THEME_LABELS[option])}
            selected={mode === option}
            onPress={() => setMode(option)}
          />
        )),
      )}
      {group(
        t('settings.appearance.language'),
        LANGUAGE_OPTIONS.map((option) => (
          <OptionRow
            key={option}
            label={t(LANGUAGE_LABELS[option])}
            selected={preference === option}
            onPress={() => setPreference(option)}
          />
        )),
      )}
    </SettingsPage>
  );
}

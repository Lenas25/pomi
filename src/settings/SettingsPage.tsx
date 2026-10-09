import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { useT } from '../i18n';
import { InfoButton } from '../ui/InfoButton';
import { Screen } from '../ui/Screen';
import { StepHeader } from '../ui/StepHeader';
import { useTheme } from '../ui/theme';

type SettingsPageProps = {
  title: string;
  /** One short line under the title. */
  intro?: string;
  /** The longer explanation, behind an (i) button next to the title. */
  info?: string | readonly string[];
  children: ReactNode;
};

/** The frame of an Ajustes detail page: back, title (+ info sheet), one-line intro, content. */
export function SettingsPage({ title, intro, info, children }: SettingsPageProps) {
  const t = useT();
  const theme = useTheme();
  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
        <StepHeader
          backLabel={t('settings.back')}
          onBack={() => (router.canGoBack() ? router.back() : router.navigate('/ajustes'))}
        >
          <Text
            accessibilityRole="header"
            style={[theme.text('title-lg'), { color: theme.color.text, flex: 1 }]}
          >
            {title}
          </Text>
          {info ? <InfoButton title={title} body={info} /> : null}
        </StepHeader>
        {intro ? (
          <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>{intro}</Text>
        ) : null}
        {children}
      </View>
    </Screen>
  );
}

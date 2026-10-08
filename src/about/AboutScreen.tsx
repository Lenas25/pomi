import { Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';

import { useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/theme';

import { LICENSE_NAME, REPO_URL } from './info';

/** Ajustes > Acerca de: version, license, the medical disclaimer and the repository. */
export function AboutScreen() {
  const t = useT();
  const theme = useTheme();
  const version = Constants.expoConfig?.version ?? '0.0.0';

  const row = (label: string, value: string) => (
    <View style={{ gap: theme.space[1] }}>
      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{label}</Text>
      <Text selectable style={[theme.text('body'), { color: theme.color.text }]}>
        {value}
      </Text>
    </View>
  );

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('about.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('about.tagline')}
        </Text>
        <Card>
          <View style={{ gap: theme.space[3] }}>
            {row(t('about.version'), version)}
            {row(t('about.license'), LICENSE_NAME)}
            {row(t('about.repository'), REPO_URL)}
            {row(t('about.privacy'), t('about.privacyBody'))}
          </View>
        </Card>
        <Card variant="highlight">
          <View style={{ gap: theme.space[2] }}>
            <Text
              accessibilityRole="header"
              style={[theme.text('title-sm'), { color: theme.color.text }]}
            >
              {t('about.disclaimerTitle')}
            </Text>
            <Text style={[theme.text('body'), { color: theme.color.text }]}>
              {t('about.disclaimer')}
            </Text>
          </View>
        </Card>
        <Button label={t('settings.back')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

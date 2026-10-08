import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  Barbell,
  Bell,
  FloppyDisk,
  Images,
  Info,
  MoonStars,
  ShieldCheck,
} from 'phosphor-react-native';

import { useT } from '../../src/i18n';
import { FreeDaysSettings } from '../../src/settings/FreeDaysSettings';
import { ScheduleSettings } from '../../src/settings/ScheduleSettings';
import { SedentarySettings } from '../../src/sedentary/SedentarySettings';
import { Card } from '../../src/ui/Card';
import { Screen } from '../../src/ui/Screen';
import { useTheme } from '../../src/ui/theme';

/** Settings: entries to the sub-screens plus the inline schedule, free days and sedentary cards. */
export default function Ajustes() {
  const t = useT();
  const theme = useTheme();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('settings.title')}
        </Text>

        <Card
          onPress={() => router.push('/permisos')}
          accessibilityLabel={t('settings.permissions.title')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            <ShieldCheck color={theme.color.text} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
                {t('settings.permissions.title')}
              </Text>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('settings.permissions.body')}
              </Text>
            </View>
          </View>
        </Card>

        <Card
          onPress={() => router.push('/mis-avisos')}
          accessibilityLabel={t('settings.myNotifications.entryTitle')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            <Bell color={theme.color.text} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
                {t('settings.myNotifications.entryTitle')}
              </Text>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('settings.myNotifications.entryBody')}
              </Text>
            </View>
          </View>
        </Card>

        <Card
          onPress={() => router.push('/importar-programa')}
          accessibilityLabel={t('settings.programImport.title')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            <Barbell color={theme.color.text} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
                {t('settings.programImport.title')}
              </Text>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('settings.programImport.body')}
              </Text>
            </View>
          </View>
        </Card>

        <Card
          onPress={() => router.push('/respaldo')}
          accessibilityLabel={t('settings.backup.title')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            <FloppyDisk color={theme.color.text} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
                {t('settings.backup.title')}
              </Text>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('settings.backup.body')}
              </Text>
            </View>
          </View>
        </Card>

        <Card
          onPress={() => router.push('/ciclos-sueno')}
          accessibilityLabel={t('sleepCalc.entry.title')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            <MoonStars color={theme.color.text} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
                {t('sleepCalc.entry.title')}
              </Text>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('sleepCalc.entry.body')}
              </Text>
            </View>
          </View>
        </Card>

        <Card onPress={() => router.push('/fotos')} accessibilityLabel={t('settings.photos.title')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            <Images color={theme.color.text} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
                {t('settings.photos.title')}
              </Text>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('settings.photos.body')}
              </Text>
            </View>
          </View>
        </Card>

        <Card onPress={() => router.push('/acerca')} accessibilityLabel={t('settings.about.title')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            <Info color={theme.color.text} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
                {t('settings.about.title')}
              </Text>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('settings.about.body')}
              </Text>
            </View>
          </View>
        </Card>

        <ScheduleSettings />

        <FreeDaysSettings />

        <SedentarySettings />
      </ScrollView>
    </Screen>
  );
}

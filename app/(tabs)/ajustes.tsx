import { ScrollView, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Barbell, FloppyDisk, Images, Info, MoonStars, ShieldCheck } from 'phosphor-react-native';

import { useT } from '../../src/i18n';
import { useNotificationPrefs } from '../../src/notifications/useNotificationPrefs';
import { Card } from '../../src/ui/Card';
import { OptionRow } from '../../src/ui/OptionRow';
import { Screen } from '../../src/ui/Screen';
import { NumberStepper, TimeStepper } from '../../src/ui/Stepper';
import { useTheme } from '../../src/ui/theme';

const DEFAULT_SURVEY_TIME = '20:00';
const DEFAULT_MONTHLY_DAY = 1;
/** Day 29-31 do not exist every month, so the review day stops at 28. */
const MAX_MONTHLY_DAY = 28;

/** Settings. Only the alert section and the permissions entry exist so far (M6); more comes later. */
export default function Ajustes() {
  const t = useT();
  const theme = useTheme();
  const { prefs, update, failed } = useNotificationPrefs();
  const enabled = prefs?.enabled ?? true;
  const survey = prefs?.survey ?? true;
  const weekly = prefs?.weeklyReview ?? true;
  const monthly = prefs?.monthlyReview ?? true;

  const toggle = (label: string, value: boolean, onChange: (next: boolean) => void) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.space[3],
        minHeight: theme.touch.min,
      }}
    >
      <Text style={[theme.text('body'), { flex: 1, color: theme.color.text }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.color.brand, false: theme.color.border }}
        thumbColor={theme.color.surface}
      />
    </View>
  );

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

        {prefs === null ? null : (
          <Card>
            <View style={{ gap: theme.space[2] }}>
              <Text
                accessibilityRole="header"
                style={[theme.text('title-sm'), { color: theme.color.text }]}
              >
                {t('settings.notifications.title')}
              </Text>
              {toggle(
                t('settings.notifications.master'),
                enabled,
                (next) => void update({ enabled: next }),
              )}
              {enabled ? (
                <>
                  {toggle(
                    t('settings.notifications.survey'),
                    survey,
                    (next) => void update({ survey: next }),
                  )}
                  {survey ? (
                    <View accessibilityRole="radiogroup" style={{ gap: theme.space[2] }}>
                      <OptionRow
                        label={t('settings.notifications.surveyAuto')}
                        selected={prefs.surveyTime === undefined}
                        onPress={() => void update({ surveyTime: undefined })}
                      />
                      <OptionRow
                        label={t('settings.notifications.surveyFixed')}
                        selected={prefs.surveyTime !== undefined}
                        onPress={() =>
                          void update({ surveyTime: prefs.surveyTime ?? DEFAULT_SURVEY_TIME })
                        }
                      />
                      {prefs.surveyTime !== undefined ? (
                        <TimeStepper
                          label={t('settings.notifications.surveyTime')}
                          value={prefs.surveyTime}
                          onChange={(value) => void update({ surveyTime: value })}
                        />
                      ) : null}
                    </View>
                  ) : null}
                  {toggle(
                    t('settings.notifications.weekly'),
                    weekly,
                    (next) => void update({ weeklyReview: next }),
                  )}
                  {toggle(
                    t('settings.notifications.monthly'),
                    monthly,
                    (next) => void update({ monthlyReview: next }),
                  )}
                  {monthly ? (
                    <NumberStepper
                      label={t('settings.notifications.monthlyDay')}
                      value={prefs.monthlyReviewDay ?? DEFAULT_MONTHLY_DAY}
                      min={1}
                      max={MAX_MONTHLY_DAY}
                      step={1}
                      format={(day) => t('settings.notifications.monthlyDayValue', { day })}
                      onChange={(day) => void update({ monthlyReviewDay: day })}
                    />
                  ) : null}
                </>
              ) : null}
              {failed ? (
                <Text style={[theme.text('caption'), { color: theme.color.error }]}>
                  {t('settings.saveFailed')}
                </Text>
              ) : null}
            </View>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

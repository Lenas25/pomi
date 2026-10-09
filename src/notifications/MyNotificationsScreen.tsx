// Ajustes > "Mis avisos" (PLAN §7.1): which notifications fire and when, by category, with a
// preview of tomorrow built by the real planner. Every change is saved and resyncs the schedule.
import type { ReactNode } from 'react';
import { Switch, Text, View } from 'react-native';
import { router } from 'expo-router';

import {
  CHECKIN_OFFSET_MAX,
  DEFAULT_GYM_BEFORE_MIN,
  DEFAULT_MORNING_OFFSET_MIN,
  DEFAULT_NIGHT_OFFSET_MIN,
  DEFAULT_SCREENS_BEFORE_MIN,
  EVERY_MIN_MAX,
  EVERY_MIN_MIN,
  GYM_BEFORE_MAX,
  MAX_QUIET_WINDOWS,
  SCREENS_OFF_BEFORE_MAX,
  SCREENS_OFF_BEFORE_MIN,
  moveWindowStart,
  windowCrossesMidnight,
  type QuietWindow,
  type RepeatPrefs,
} from '../domain/notifications/prefs';
import { useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { OptionRow } from '../ui/OptionRow';
import { Screen } from '../ui/Screen';
import { NumberStepper, TimeStepper } from '../ui/Stepper';
import { useTheme } from '../ui/theme';
import { WeekdayChips } from '../ui/WeekdayChips';

import { useNotificationPrefs, type NotificationPrefs } from './useNotificationPrefs';
import { previewRows, useTomorrowPreview } from './useTomorrowPreview';

const DEFAULT_SURVEY_TIME = '20:00';
const DEFAULT_MONTHLY_DAY = 1;
/** Day 29-31 do not exist every month, so the review day stops at 28. */
const MAX_MONTHLY_DAY = 28;
const MINUTE_STEP = 5;
const EVERY_STEP = 15;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WORK_DAYS = [1, 2, 3, 4, 5];
/** Starting values when the person switches a repeating category to "Personalizado". */
const CUSTOM_WATER: RepeatPrefs = { from: '08:00', until: '20:00', everyMin: 60, days: ALL_DAYS };
const CUSTOM_PAUSE: RepeatPrefs = { from: '09:00', until: '18:00', everyMin: 60, days: WORK_DAYS };
const NEW_QUIET: QuietWindow = { from: '13:00', until: '15:00', days: WORK_DAYS };

type RepeatKey = 'water' | 'activePause';

export function MyNotificationsScreen() {
  const t = useT();
  const theme = useTheme();
  const { prefs, bedMin, loadFailed, retry, update, failed } = useNotificationPrefs();
  const preview = useTomorrowPreview(prefs);

  if (loadFailed) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
          <Text
            accessibilityRole="alert"
            style={[theme.text('body'), { color: theme.color.error }]}
          >
            {t('settings.myNotifications.loadFailed')}
          </Text>
          <Button label={t('settings.myNotifications.retry')} variant="secondary" onPress={retry} />
        </View>
      </Screen>
    );
  }
  if (prefs === null) return <Screen>{null}</Screen>;

  const enabled = prefs.enabled ?? true;
  const survey = prefs.survey ?? true;
  const monthly = prefs.monthlyReview ?? true;
  const muted = [theme.text('caption'), { color: theme.color.textMuted }];
  const minutesText = (count: number) => t('settings.myNotifications.minutesValue', { count });

  const patch = <K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) =>
    void update({ [key]: value } as Partial<NotificationPrefs>);

  const switchRow = (label: string, value: boolean, onChange: (next: boolean) => void) => (
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

  const section = (title: string, children: ReactNode) => (
    <Card>
      <View style={{ gap: theme.space[2] }}>
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

  const repeatEditor = (key: RepeatKey, onLabel: string, custom: RepeatPrefs) => {
    const value = prefs[key] ?? {};
    const on = value.enabled ?? true;
    const isCustom = value.from !== undefined;
    // Only the changed fields: the hook merges them into the CURRENT stored category.
    const set = (next: RepeatPrefs) => patch(key, next);
    const windowOf = (stored: RepeatPrefs | undefined) => ({
      from: stored?.from ?? custom.from ?? '08:00',
      until: stored?.until ?? custom.until ?? '20:00',
    });
    const crosses = isCustom && windowCrossesMidnight(windowOf(value));
    return (
      <>
        {switchRow(onLabel, on, (next) => set({ enabled: next }))}
        {on ? (
          <View accessibilityRole="radiogroup" style={{ gap: theme.space[2] }}>
            <OptionRow
              label={t('settings.myNotifications.windowAuto')}
              selected={!isCustom}
              onPress={() =>
                set({ from: undefined, until: undefined, everyMin: undefined, days: undefined })
              }
            />
            <OptionRow
              label={t('settings.myNotifications.windowCustom')}
              selected={isCustom}
              onPress={() => (isCustom ? undefined : set(custom))}
            />
            {isCustom ? (
              <>
                <TimeStepper
                  label={t('settings.myNotifications.from')}
                  value={windowOf(value).from}
                  // A start past the end moves the end along (same span, before bed and midnight).
                  onChange={(from) =>
                    void update((current) => ({
                      [key]: moveWindowStart(windowOf(current[key]), from, bedMin),
                    }))
                  }
                />
                <TimeStepper
                  label={t('settings.myNotifications.until')}
                  value={windowOf(value).until}
                  onChange={(until) => set({ until })}
                />
                {crosses ? (
                  <Text style={[theme.text('caption'), { color: theme.color.error }]}>
                    {t('settings.myNotifications.windowCrossesMidnight')}
                  </Text>
                ) : null}
                <NumberStepper
                  label={t('settings.myNotifications.every')}
                  value={value.everyMin ?? custom.everyMin ?? 60}
                  min={EVERY_MIN_MIN}
                  max={EVERY_MIN_MAX}
                  step={EVERY_STEP}
                  format={(count) => t('settings.myNotifications.everyValue', { count })}
                  onChange={(everyMin) => set({ everyMin })}
                />
                <Text style={muted}>{t('settings.myNotifications.days')}</Text>
                <WeekdayChips
                  selected={[...(value.days ?? custom.days ?? ALL_DAYS)]}
                  // At least one day: an empty selection would be "off", which is the switch.
                  onChange={(days) => (days.length > 0 ? set({ days: [...days] }) : undefined)}
                  accessibilityLabel={`${onLabel}: ${t('settings.myNotifications.days')}`}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </>
    );
  };

  const quiet = prefs.quietHours ?? [];
  // Computed from the CURRENT stored windows, so two quick edits never overwrite each other.
  const editQuiet = (edit: (windows: readonly QuietWindow[]) => QuietWindow[]) =>
    void update((current) => {
      const next = edit(current.quietHours ?? []);
      return { quietHours: next.length > 0 ? next : undefined };
    });

  const rows = preview.status === 'ready' ? previewRows(preview.planned, t) : [];

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('settings.myNotifications.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('settings.myNotifications.hint')}
        </Text>

        {section(
          t('settings.myNotifications.general'),
          <>
            {switchRow(t('settings.notifications.master'), enabled, (next) =>
              patch('enabled', next),
            )}
            {enabled ? (
              <>
                {switchRow(t('settings.notifications.survey'), survey, (next) =>
                  patch('survey', next),
                )}
                {survey ? (
                  <View accessibilityRole="radiogroup" style={{ gap: theme.space[2] }}>
                    <OptionRow
                      label={t('settings.notifications.surveyAuto')}
                      selected={prefs.surveyTime === undefined}
                      onPress={() => patch('surveyTime', undefined)}
                    />
                    <OptionRow
                      label={t('settings.notifications.surveyFixed')}
                      selected={prefs.surveyTime !== undefined}
                      onPress={() => patch('surveyTime', prefs.surveyTime ?? DEFAULT_SURVEY_TIME)}
                    />
                    {prefs.surveyTime !== undefined ? (
                      <TimeStepper
                        label={t('settings.notifications.surveyTime')}
                        value={prefs.surveyTime}
                        onChange={(value) => patch('surveyTime', value)}
                      />
                    ) : null}
                  </View>
                ) : null}
                {switchRow(t('settings.notifications.weekly'), prefs.weeklyReview ?? true, (next) =>
                  patch('weeklyReview', next),
                )}
                {switchRow(t('settings.notifications.monthly'), monthly, (next) =>
                  patch('monthlyReview', next),
                )}
                {monthly ? (
                  <NumberStepper
                    label={t('settings.notifications.monthlyDay')}
                    value={prefs.monthlyReviewDay ?? DEFAULT_MONTHLY_DAY}
                    min={1}
                    max={MAX_MONTHLY_DAY}
                    step={1}
                    format={(day) => t('settings.notifications.monthlyDayValue', { day })}
                    onChange={(day) => patch('monthlyReviewDay', day)}
                  />
                ) : null}
              </>
            ) : null}
          </>,
        )}

        {enabled ? (
          <>
            {section(
              t('settings.myNotifications.water'),
              repeatEditor('water', t('settings.myNotifications.waterOn'), CUSTOM_WATER),
            )}

            {section(
              t('settings.myNotifications.gym'),
              <>
                {switchRow(
                  t('settings.myNotifications.gymOn'),
                  prefs.gym?.enabled ?? true,
                  (next) => patch('gym', { enabled: next }),
                )}
                {(prefs.gym?.enabled ?? true) ? (
                  <NumberStepper
                    label={t('settings.myNotifications.gymBefore')}
                    value={prefs.gym?.minutesBefore ?? DEFAULT_GYM_BEFORE_MIN}
                    min={0}
                    max={GYM_BEFORE_MAX}
                    step={MINUTE_STEP}
                    format={minutesText}
                    onChange={(minutesBefore) => patch('gym', { minutesBefore })}
                  />
                ) : null}
              </>,
            )}

            {section(
              t('settings.myNotifications.checkins'),
              <>
                {switchRow(
                  t('settings.myNotifications.morningOn'),
                  prefs.morningCheckin?.enabled ?? true,
                  (next) => patch('morningCheckin', { enabled: next }),
                )}
                {(prefs.morningCheckin?.enabled ?? true) ? (
                  <NumberStepper
                    label={t('settings.myNotifications.morningOffset')}
                    value={prefs.morningCheckin?.offsetAfterWakeMin ?? DEFAULT_MORNING_OFFSET_MIN}
                    min={0}
                    max={CHECKIN_OFFSET_MAX}
                    step={MINUTE_STEP}
                    format={minutesText}
                    onChange={(offsetAfterWakeMin) =>
                      patch('morningCheckin', { offsetAfterWakeMin })
                    }
                  />
                ) : null}
                {switchRow(
                  t('settings.myNotifications.nightOn'),
                  prefs.nightCheckin?.enabled ?? true,
                  (next) => patch('nightCheckin', { enabled: next }),
                )}
                {(prefs.nightCheckin?.enabled ?? true) ? (
                  <NumberStepper
                    label={t('settings.myNotifications.nightOffset')}
                    value={prefs.nightCheckin?.offsetBeforeBedMin ?? DEFAULT_NIGHT_OFFSET_MIN}
                    min={0}
                    max={CHECKIN_OFFSET_MAX}
                    step={MINUTE_STEP}
                    format={minutesText}
                    onChange={(offsetBeforeBedMin) => patch('nightCheckin', { offsetBeforeBedMin })}
                  />
                ) : null}
              </>,
            )}

            {section(
              t('settings.myNotifications.sleep'),
              <>
                {switchRow(
                  t('settings.myNotifications.bedtimeOn'),
                  prefs.bedtime?.enabled ?? true,
                  (next) => patch('bedtime', { enabled: next }),
                )}
                {switchRow(
                  t('settings.myNotifications.screensOn'),
                  prefs.screensOff?.enabled ?? true,
                  (next) => patch('screensOff', { enabled: next }),
                )}
                {(prefs.screensOff?.enabled ?? true) ? (
                  <NumberStepper
                    label={t('settings.myNotifications.screensBefore')}
                    value={prefs.screensOff?.minutesBefore ?? DEFAULT_SCREENS_BEFORE_MIN}
                    min={SCREENS_OFF_BEFORE_MIN}
                    max={SCREENS_OFF_BEFORE_MAX}
                    step={MINUTE_STEP}
                    format={minutesText}
                    onChange={(minutesBefore) => patch('screensOff', { minutesBefore })}
                  />
                ) : null}
              </>,
            )}

            {section(
              t('settings.myNotifications.pause'),
              <>
                <Text style={muted}>{t('settings.myNotifications.pauseOnlySitting')}</Text>
                {repeatEditor('activePause', t('settings.myNotifications.pauseOn'), CUSTOM_PAUSE)}
              </>,
            )}

            {section(
              t('settings.myNotifications.quiet'),
              <>
                <Text style={muted}>{t('settings.myNotifications.quietHint')}</Text>
                {quiet.map((window, index) => {
                  const name = t('settings.myNotifications.quietWindow', { index: index + 1 });
                  const change = (next: Partial<QuietWindow>) =>
                    editQuiet((windows) =>
                      windows.map((item, at) => (at === index ? { ...item, ...next } : item)),
                    );
                  return (
                    <View key={index} style={{ gap: theme.space[2] }}>
                      <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                        {name}
                      </Text>
                      <TimeStepper
                        label={`${name}: ${t('settings.myNotifications.from')}`}
                        value={window.from}
                        onChange={(from) => change({ from })}
                      />
                      <TimeStepper
                        label={`${name}: ${t('settings.myNotifications.until')}`}
                        value={window.until}
                        onChange={(until) => change({ until })}
                      />
                      <WeekdayChips
                        selected={[...window.days]}
                        onChange={(days) =>
                          days.length > 0 ? change({ days: [...days] }) : undefined
                        }
                        accessibilityLabel={`${name}: ${t('settings.myNotifications.days')}`}
                      />
                      <Button
                        label={t('settings.myNotifications.quietRemove', { index: index + 1 })}
                        variant="ghost"
                        onPress={() =>
                          editQuiet((windows) => windows.filter((_, at) => at !== index))
                        }
                      />
                    </View>
                  );
                })}
                {quiet.length < MAX_QUIET_WINDOWS ? (
                  <Button
                    label={t('settings.myNotifications.quietAdd')}
                    variant="secondary"
                    onPress={() =>
                      editQuiet((windows) =>
                        windows.length < MAX_QUIET_WINDOWS ? [...windows, NEW_QUIET] : [...windows],
                      )
                    }
                  />
                ) : null}
              </>,
            )}

            {section(
              t('settings.myNotifications.sedentary'),
              <>
                <Text style={muted}>{t('settings.myNotifications.sedentaryHint')}</Text>
                <Button
                  label={t('settings.myNotifications.sedentaryOpen')}
                  variant="secondary"
                  onPress={() => router.push('/inactividad')}
                />
              </>,
            )}
          </>
        ) : null}

        {section(
          preview.status === 'ready'
            ? t('settings.myNotifications.previewHeader', { count: rows.length })
            : t('settings.myNotifications.preview'),
          <View style={{ gap: theme.space[1] }}>
            {preview.status === 'ready' && rows.length > 0 ? (
              // Only this summary is announced when the preview changes, never the whole list.
              <Text accessibilityLiveRegion="polite" style={muted}>
                {t(
                  rows.length === 1
                    ? 'settings.myNotifications.previewCountOne'
                    : 'settings.myNotifications.previewCountOther',
                  { count: rows.length },
                )}
              </Text>
            ) : null}
            {preview.status === 'off' ? (
              <Text style={muted}>{t('settings.myNotifications.previewOff')}</Text>
            ) : preview.status === 'error' ? (
              <Text style={[theme.text('caption'), { color: theme.color.error }]}>
                {t('settings.myNotifications.previewError')}
              </Text>
            ) : preview.status === 'ready' && rows.length === 0 ? (
              <Text style={muted}>{t('settings.myNotifications.previewEmpty')}</Text>
            ) : (
              rows.map((row) => (
                <View
                  key={row.id}
                  accessible
                  accessibilityLabel={t('settings.myNotifications.previewItem', {
                    time: row.time,
                    title: row.title,
                  })}
                  style={{ flexDirection: 'row', gap: theme.space[3] }}
                >
                  <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                    {row.time}
                  </Text>
                  <Text style={[theme.text('body'), { flex: 1, color: theme.color.text }]}>
                    {row.title}
                  </Text>
                </View>
              ))
            )}
          </View>,
        )}

        {failed ? (
          <Text
            accessibilityRole="alert"
            style={[theme.text('caption'), { color: theme.color.error }]}
          >
            {t('settings.saveFailed')}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

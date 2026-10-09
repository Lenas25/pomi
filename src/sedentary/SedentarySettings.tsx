// Ajustes > Pausa por inactividad (PLAN §14b): everything the sedentary nudge lets you configure, with the
// honest note that it is approximate.
import { Switch, Text, View } from 'react-native';

import { useT } from '../i18n';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { OptionRow } from '../ui/OptionRow';
import { NumberStepper } from '../ui/Stepper';
import { useTheme } from '../ui/theme';
import { WINDOW_OPTIONS_MIN } from '../domain/sedentary';

import { useSedentarySettings, type SedentaryNotice } from './useSedentarySettings';
import { Button } from '../ui/Button';

/** Notices that the Health Connect settings screen can fix. */
const FIXABLE_NOTICES: readonly SedentaryNotice[] = [
  'denied',
  'bgDenied',
  'featureUnavailable',
  'missingPermission',
];
const THRESHOLD_STEP = 50;
/** Monday first. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_KEYS = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6'] as const;

export function SedentarySettings() {
  const t = useT();
  const theme = useTheme();
  const { config, notice, update, setEnabled, openHealthSettings } = useSedentarySettings();
  if (!config) return null;

  const muted = [theme.text('caption'), { color: theme.color.textMuted }];
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

  const toggleDay = (day: number) => {
    const days = config.days.includes(day)
      ? config.days.filter((value) => value !== day)
      : [...config.days, day];
    void update({ days: days.sort((a, b) => a - b) });
  };

  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        {switchRow(t('sedentary.enable'), config.enabled, (next) => void setEnabled(next))}

        {switchRow(
          t('sedentary.noPhone'),
          config.noPhone,
          (next) => void update({ noPhone: next }),
        )}
        {config.noPhone ? (
          <Text accessibilityLiveRegion="polite" style={muted}>
            {t('sedentary.noPhoneOn')}
          </Text>
        ) : null}

        {config.enabled && !config.noPhone ? (
          <>
            <View accessibilityRole="radiogroup" style={{ gap: theme.space[2] }}>
              <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                {t('sedentary.window')}
              </Text>
              {WINDOW_OPTIONS_MIN.map((min) => (
                <OptionRow
                  key={min}
                  label={t('sedentary.windowOption', { min })}
                  selected={config.windowMin === min}
                  onPress={() => void update({ windowMin: min })}
                />
              ))}
            </View>
            <NumberStepper
              label={t('sedentary.threshold')}
              value={config.threshold}
              min={THRESHOLD_STEP}
              max={500}
              step={THRESHOLD_STEP}
              format={(steps) => t('sedentary.thresholdValue', { steps })}
              onChange={(threshold) => void update({ threshold })}
            />
            <View style={{ gap: theme.space[2] }}>
              <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                {t('sedentary.days')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                {WEEK_ORDER.map((day) => (
                  <Chip
                    key={day}
                    label={t(`weekdays.short.${DAY_KEYS[day] ?? 'd0'}`)}
                    accessibilityLabel={t(`weekdays.long.${DAY_KEYS[day] ?? 'd0'}`)}
                    selected={config.days.includes(day)}
                    onPress={() => toggleDay(day)}
                  />
                ))}
              </View>
            </View>
            <NumberStepper
              label={t('sedentary.maxPerDay')}
              value={config.maxPerDay}
              min={1}
              max={5}
              step={1}
              format={(count) => t('sedentary.maxPerDayValue', { count })}
              onChange={(maxPerDay) => void update({ maxPerDay })}
            />
          </>
        ) : null}

        {notice ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[theme.text('caption'), { color: theme.color.error }]}
          >
            {t(`sedentary.${notice}`)}
          </Text>
        ) : null}
        {FIXABLE_NOTICES.includes(notice) ? (
          <Button
            label={t('sedentary.openHealthSettings')}
            variant="secondary"
            onPress={openHealthSettings}
          />
        ) : null}
      </View>
    </Card>
  );
}

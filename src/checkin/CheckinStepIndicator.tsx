import { Text, View } from 'react-native';
import { Check, MoonStars, Smiley, type Icon } from 'phosphor-react-native';

import { useT, type TranslationKey } from '../i18n';
import type { CheckinKind } from '../domain/habits/checkins';
import { useTheme, type SectionKey } from '../ui/theme';

import type { CheckinStepId } from './checkinSteps';

const ICONS: Record<CheckinStepId, Icon> = { times: MoonStars, rate: Smiley, done: Check };

export function stepNameKey(kind: CheckinKind, step: CheckinStepId): TranslationKey {
  if (step === 'done') return 'checkin.steps.done';
  if (kind === 'morning') {
    return step === 'times' ? 'checkin.steps.morningTimes' : 'checkin.steps.morningRate';
  }
  return step === 'times' ? 'checkin.steps.nightTimes' : 'checkin.steps.nightRate';
}

/**
 * The check-in steps as icons with a word ("Sueño · Calidad · Listo"); the current one is filled
 * in the section color, the done ones show their color as an outline. One spoken summary.
 */
export function CheckinStepIndicator({
  kind,
  steps,
  current,
  section,
}: {
  kind: CheckinKind;
  steps: readonly CheckinStepId[];
  current: number;
  section: SectionKey;
}) {
  const theme = useTheme();
  const t = useT();
  const colors = theme.section[section];
  const currentStep = steps[current] ?? 'done';
  return (
    <View
      testID="checkin-steps"
      accessible
      accessibilityLabel={t('checkin.steps.label', {
        current: current + 1,
        total: steps.length,
        name: t(stepNameKey(kind, currentStep)),
      })}
      style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: theme.space[2] }}
    >
      {steps.map((step, index) => {
        const StepIcon = ICONS[step];
        const active = index === current;
        const passed = index < current;
        return (
          <View
            key={step}
            style={{
              flex: 1,
              maxWidth: theme.touch.gym * 2,
              alignItems: 'center',
              gap: theme.space[1],
            }}
          >
            <View
              style={{
                width: theme.touch.gym * 0.75,
                height: theme.touch.gym * 0.75,
                borderRadius: theme.radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: theme.stroke.bold,
                borderColor: active || passed ? colors.text : theme.color.border,
                backgroundColor: active ? colors.fill : theme.color.surface,
              }}
            >
              <StepIcon
                size={theme.icon.size * 0.75}
                weight={active ? 'fill' : 'bold'}
                color={active ? colors.onFill : passed ? colors.text : theme.color.textMuted}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[
                theme.text(active ? 'body-strong' : 'caption'),
                { color: active ? colors.text : theme.color.textMuted },
              ]}
            >
              {t(stepNameKey(kind, step))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

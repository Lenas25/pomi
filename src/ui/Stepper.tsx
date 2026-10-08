import { Pressable, Text, View } from 'react-native';
import { Minus, Plus } from 'phosphor-react-native';

import { clockToMinutes, minutesToClock } from '../domain/time';
import { useT } from '../i18n';
import { useTheme } from './theme';

type StepButtonProps = {
  label: string;
  onPress: () => void;
  disabled: boolean;
  kind: 'minus' | 'plus';
};

function StepButton({ label, onPress, disabled, kind }: StepButtonProps) {
  const theme = useTheme();
  const IconComponent = kind === 'plus' ? Plus : Minus;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: theme.touch.gym,
        height: theme.touch.gym,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.surface,
        borderColor: theme.color.border,
        borderWidth: theme.stroke.hairline,
        opacity: disabled ? theme.opacity.disabled : pressed ? theme.opacity.pressed : 1,
      })}
    >
      <IconComponent color={theme.color.text} />
    </Pressable>
  );
}

type StepperProps = {
  /** Visible label above the control; also names the +/- buttons. */
  label: string;
  valueText: string;
  onIncrement: () => void;
  onDecrement: () => void;
  incrementDisabled?: boolean;
  decrementDisabled?: boolean;
};

/** A "- value +" control with 48 dp buttons. The value is a polite live region. */
export function Stepper({
  label,
  valueText,
  onIncrement,
  onDecrement,
  incrementDisabled = false,
  decrementDisabled = false,
}: StepperProps) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[4] }}>
        <StepButton
          kind="minus"
          label={t('onboarding.decrease', { label })}
          onPress={onDecrement}
          disabled={decrementDisabled}
        />
        <Text
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${label}: ${valueText}`}
          style={[
            theme.text('title-md'),
            { color: theme.color.text, minWidth: theme.touch.gym * 2, textAlign: 'center' },
          ]}
        >
          {valueText}
        </Text>
        <StepButton
          kind="plus"
          label={t('onboarding.increase', { label })}
          onPress={onIncrement}
          disabled={incrementDisabled}
        />
      </View>
    </View>
  );
}

type NumberStepperProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  min: number;
  max: number;
  /** Text for the current value, e.g. `7.5 h`. Defaults to the number. */
  format?: (value: number) => string;
};

/** Rounds away binary noise from repeated additions of steps such as 0.25. */
function clean(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function NumberStepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  format,
}: NumberStepperProps) {
  return (
    <Stepper
      label={label}
      valueText={format ? format(value) : String(value)}
      onIncrement={() => onChange(Math.min(max, clean(value + step)))}
      onDecrement={() => onChange(Math.max(min, clean(value - step)))}
      incrementDisabled={value >= max}
      decrementDisabled={value <= min}
    />
  );
}

const MINUTE_STEP = 5;

type TimeStepperProps = {
  label: string;
  /** `HH:mm`. */
  value: string;
  onChange: (value: string) => void;
};

/** Hour and minute (5-minute steps) steppers that wrap around, for places without a time picker dependency. */
export function TimeStepper({ label, value, onChange }: TimeStepperProps) {
  const theme = useTheme();
  const t = useT();
  const total = clockToMinutes(value);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  // Steps the TOTAL minutes of the day, so 23:55 + 5 min -> 00:00 and 00:00 - 5 min -> 23:55.
  const shift = (delta: number) =>
    onChange(minutesToClock((((total + delta) % 1440) + 1440) % 1440));

  return (
    <View accessibilityLabel={`${label} ${value}`} style={{ gap: theme.space[2] }}>
      <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: theme.space[6], flexWrap: 'wrap' }}>
        <Stepper
          label={`${label}, ${t('onboarding.hourLabel')}`}
          valueText={String(hours).padStart(2, '0')}
          onIncrement={() => shift(60)}
          onDecrement={() => shift(-60)}
        />
        <Stepper
          label={`${label}, ${t('onboarding.minuteLabel')}`}
          valueText={String(minutes).padStart(2, '0')}
          onIncrement={() => shift(MINUTE_STEP)}
          onDecrement={() => shift(-MINUTE_STEP)}
        />
      </View>
    </View>
  );
}

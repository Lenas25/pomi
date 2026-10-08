import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Drop } from 'phosphor-react-native';

import { useT } from '../i18n';
import { bezierFromToken } from './easing';
import { ProgressBar } from './ProgressBar';
import { StepButton } from './Stepper';
import { useTheme } from './theme';

type WaterProps = {
  variant: 'water';
  value: number;
  /** Glasses to drink today (8-10 drops, HANDOFF §4). */
  target: number;
  /** Called with the new glass count when a drop is tapped. */
  onChange: (next: number) => void;
};

type StepsProps = {
  variant: 'steps';
  value: number;
  /** Goal for today, `null` while the baseline week is being measured. */
  target: number | null;
  /** Locale used to group thousands ("7,500" / "7.500"). */
  locale: string;
};

type GenericProps = {
  variant: 'generic';
  label: string;
  value: number;
  target?: number;
  onIncrement: () => void;
  onDecrement: () => void;
};

export type HabitCounterProps = WaterProps | StepsProps | GenericProps;

/** One water drop: the fill rises from the bottom in `motion.base` (a 120 ms fade with reduce-motion). */
function WaterDrop({
  filled,
  size,
  label,
  onPress,
}: {
  filled: boolean;
  size: number;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(filled ? 1 : 0, {
      duration: reduceMotion ? theme.motion.reducedFade : 300,
      easing: bezierFromToken(theme.motion.easing.inOut),
    });
  }, [filled, progress, reduceMotion, theme.motion.easing.inOut, theme.motion.reducedFade]);

  const fillStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { height: size, opacity: progress.value }
      : { height: size * progress.value, opacity: 1 },
  );

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: filled }}
      hitSlop={theme.space[1]}
      onPress={onPress}
      style={{ width: size, height: size }}
    >
      <Drop size={size} color={theme.color.textMuted} weight="regular" />
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', bottom: 0, left: 0, width: size, overflow: 'hidden' },
          fillStyle,
        ]}
      >
        <View style={{ position: 'absolute', bottom: 0, left: 0 }}>
          <Drop size={size} color={theme.color.brand} weight="fill" />
        </View>
      </Animated.View>
    </Pressable>
  );
}

function WaterCounter({ value, target, onChange }: Omit<WaterProps, 'variant'>) {
  const theme = useTheme();
  const t = useT();
  const total = Math.max(target, value);
  const tap = (index: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Tapping the last filled drop empties it; any other drop fills up to it.
    onChange(index === value ? index - 1 : index);
  };
  return (
    <View
      accessibilityLabel={t('habits.water.counterLabel', { count: value, total: target })}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}
    >
      {Array.from({ length: total }, (_unused, offset) => {
        const index = offset + 1;
        return (
          <WaterDrop
            key={index}
            size={theme.space[10]}
            filled={index <= value}
            label={t('habits.water.drop', { index, total })}
            onPress={() => tap(index)}
          />
        );
      })}
    </View>
  );
}

function StepsCounter({ value, target, locale }: Omit<StepsProps, 'variant'>) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text style={[theme.text('metric'), { color: theme.color.text }]}>
        {value.toLocaleString(locale)}
      </Text>
      {target !== null ? (
        <ProgressBar
          current={Math.min(value, target)}
          total={target}
          label={t('habits.steps.goal', { steps: target.toLocaleString(locale) })}
        />
      ) : null}
    </View>
  );
}

function GenericCounter({
  label,
  value,
  target,
  onIncrement,
  onDecrement,
}: Omit<GenericProps, 'variant'>) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[4] }}>
      <StepButton
        kind="minus"
        label={t('habits.water.remove')}
        onPress={onDecrement}
        disabled={value <= 0}
      />
      <Text
        accessibilityLabel={`${label}: ${value}${target === undefined ? '' : ` / ${target}`}`}
        accessibilityLiveRegion="polite"
        style={[theme.text('title-md'), { color: theme.color.text }]}
      >
        {target === undefined ? value : `${value} / ${target}`}
      </Text>
      <StepButton
        kind="plus"
        label={t('habits.water.add')}
        onPress={onIncrement}
        disabled={false}
      />
    </View>
  );
}

/** Habit counter (HANDOFF §4): water drops, steps number + bar, or a plain +/- counter. */
export function HabitCounter(props: HabitCounterProps) {
  switch (props.variant) {
    case 'water':
      return <WaterCounter value={props.value} target={props.target} onChange={props.onChange} />;
    case 'steps':
      return <StepsCounter value={props.value} target={props.target} locale={props.locale} />;
    case 'generic':
      return (
        <GenericCounter
          label={props.label}
          value={props.value}
          {...(props.target === undefined ? {} : { target: props.target })}
          onIncrement={props.onIncrement}
          onDecrement={props.onDecrement}
        />
      );
  }
}

import { useState } from 'react';
import { Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Check, Timer } from 'phosphor-react-native';

import { useT } from '../i18n';
import { useTheme } from '../ui/theme';

import { formatKg, type PreviousSet, type SetInputs } from './sessionViewModel';

export type SetRowStatus = 'pending' | 'current' | 'done';

export type LoggedValues = { weightKg: number | null; reps: number | null; rir: number | null };

type SetRowProps = {
  /** 0-based set index; shown as `index + 1`. */
  index: number;
  exerciseName: string;
  status: SetRowStatus;
  bodyweight: boolean;
  /** Greyed "anterior" value of this set. */
  previous: PreviousSet;
  /** Hint shown in the empty inputs: what a ✓ with empty inputs will log. */
  placeholder: PreviousSet;
  /** Present once the set is done. */
  logged: LoggedValues | null;
  /** `holdSec` exercises: starts a hold timer for this set. */
  hold?: { sec: number; onStart: () => void };
  onToggle: (inputs: SetInputs & { rir: number | null }) => void;
  onRir: (rir: number | null) => void;
};

const RIR_VALUES = [0, 1, 2, 3] as const;
const NARROW_WIDTH = 360;

function previousText(previous: PreviousSet, bodyweight: boolean): string {
  if (previous.reps === null) return '—';
  if (bodyweight || previous.weightKg === null) return String(previous.reps);
  return `${formatKg(previous.weightKg)}×${previous.reps}`;
}

/**
 * One set (HANDOFF §4): number, greyed previous value, kg and reps inputs, a 48 dp ✓ and, for the
 * current / done set, the RIR 0-3 selector. Empty inputs on ✓ use the previous value (see
 * `resolveSetValues`); the placeholders show which value that will be.
 */
export function SetRow({
  index,
  exerciseName,
  status,
  bodyweight,
  previous,
  placeholder,
  logged,
  hold,
  onToggle,
  onRir,
}: SetRowProps) {
  const theme = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const [weightText, setWeightText] = useState('');
  const [repsText, setRepsText] = useState('');
  const [rirChoice, setRirChoice] = useState<number | null>(null);
  const done = status === 'done';
  const number = index + 1;
  const showPrevious = width >= NARROW_WIDTH;

  const input = (editable: boolean) => ({
    ...theme.text('body-strong'),
    minHeight: theme.touch.gym,
    flex: 1,
    textAlign: 'center' as const,
    color: theme.color.text,
    borderRadius: theme.radius.sm,
    borderWidth: theme.stroke.bold,
    borderColor: status === 'current' ? theme.color.brand : theme.color.border,
    backgroundColor: editable ? theme.color.surface : theme.color.brandSoft,
    paddingHorizontal: theme.space[1],
  });

  const weightValue = done
    ? logged?.weightKg != null
      ? formatKg(logged.weightKg)
      : ''
    : weightText;
  const repsValue = done ? (logged?.reps != null ? String(logged.reps) : '') : repsText;

  return (
    <View style={{ gap: theme.space[2] }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[2],
          minHeight: theme.control.lg,
        }}
      >
        <Text
          style={[theme.text('body-strong'), { width: theme.space[6], color: theme.color.text }]}
        >
          {number}
        </Text>
        {showPrevious ? (
          <Text
            accessibilityLabel={t('gym.session.previousLabel', {
              value: previousText(previous, bodyweight),
            })}
            style={[
              theme.text('caption'),
              { width: theme.space[10] + theme.space[4], color: theme.color.textMuted },
            ]}
          >
            {previousText(previous, bodyweight)}
          </Text>
        ) : null}
        {bodyweight ? null : (
          <TextInput
            accessibilityLabel={t('gym.session.weightLabel', { n: number, exercise: exerciseName })}
            inputMode="decimal"
            keyboardType="numeric"
            editable={!done}
            selectTextOnFocus
            value={weightValue}
            onChangeText={setWeightText}
            placeholder={placeholder.weightKg === null ? '' : formatKg(placeholder.weightKg)}
            placeholderTextColor={theme.color.textMuted}
            style={input(!done)}
          />
        )}
        <TextInput
          accessibilityLabel={t('gym.session.repsLabel', { n: number, exercise: exerciseName })}
          inputMode="numeric"
          keyboardType="numeric"
          editable={!done}
          selectTextOnFocus
          value={repsValue}
          onChangeText={setRepsText}
          placeholder={placeholder.reps === null ? '' : String(placeholder.reps)}
          placeholderTextColor={theme.color.textMuted}
          style={input(!done)}
        />
        {hold && !done ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('gym.session.holdStart', { sec: hold.sec })}
            onPress={hold.onStart}
            style={{
              width: theme.touch.gym,
              height: theme.touch.gym,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.pill,
              backgroundColor: theme.color.brandSoft,
            }}
          >
            <Timer color={theme.color.text} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={t(done ? 'gym.session.setUndoneLabel' : 'gym.session.setDoneLabel', {
            n: number,
            exercise: exerciseName,
          })}
          accessibilityState={{ checked: done }}
          onPress={() => {
            if (done) {
              // Unmarking keeps the logged numbers in the inputs so they can be corrected.
              setWeightText(weightValue);
              setRepsText(repsValue);
              setRirChoice(logged?.rir ?? null);
            }
            onToggle({ weightText, repsText, rir: rirChoice });
          }}
          style={({ pressed }) => ({
            width: theme.touch.gym,
            height: theme.touch.gym,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.pill,
            borderWidth: theme.stroke.bold,
            borderColor: done ? theme.color.success : theme.color.border,
            backgroundColor: done ? theme.color.success : theme.color.surface,
            opacity: pressed ? theme.opacity.pressed : 1,
          })}
        >
          {/* The done state is the ✓ glyph plus the checked state, not only the color. */}
          <Check weight="bold" color={done ? theme.color.onPrimary : theme.color.textMuted} />
        </Pressable>
      </View>

      {status === 'pending' ? null : (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('gym.session.rirTitle')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}
        >
          <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
            {t('gym.session.rirTitle')}
          </Text>
          {RIR_VALUES.map((value) => {
            const selected = (done ? logged?.rir : rirChoice) === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityLabel={t('gym.session.rirLabel', { value })}
                accessibilityState={{ selected }}
                // Before the ✓ the choice is kept locally and logged with it; afterwards it edits the log.
                onPress={() => {
                  const next = selected ? null : value;
                  if (done) onRir(next);
                  else setRirChoice(next);
                }}
                style={{
                  width: theme.touch.gym,
                  height: theme.touch.gym,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radius.pill,
                  borderWidth: theme.stroke.bold,
                  borderColor: selected ? theme.color.brand : theme.color.border,
                  backgroundColor: selected ? theme.color.brandSoft : theme.color.surface,
                }}
              >
                <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

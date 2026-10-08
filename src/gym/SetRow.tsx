import { memo, useState } from 'react';
import { Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Check, Timer } from 'phosphor-react-native';

import { useLocaleStore, useT } from '../i18n';
import type { Language } from '../i18n/types';
import { useTheme } from '../ui/theme';

import {
  formatKg,
  validateSetInputs,
  type InputErrors,
  type PreviousSet,
  type SetInputs,
} from './sessionViewModel';

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
  /** `holdSec` exercises: seconds of the hold; `onHold` starts the hold timer of this set. */
  holdSec?: number;
  onHold?: (index: number) => void;
  /** Callbacks receive the set `index` so one stable function serves every row (memoized rows). */
  onToggle: (index: number, inputs: SetInputs & { rir: number | null }) => void;
  onRir: (index: number, rir: number | null) => void;
};

const RIR_VALUES = [0, 1, 2, 3] as const;
const NARROW_WIDTH = 360;

function previousText(previous: PreviousSet, bodyweight: boolean, language: Language): string {
  if (previous.reps === null) return '—';
  if (bodyweight || previous.weightKg === null) return String(previous.reps);
  return `${formatKg(previous.weightKg, language)}×${previous.reps}`;
}

const NO_ERRORS: InputErrors = { weight: false, reps: false };

/**
 * One set (HANDOFF §4): number, greyed previous value, kg and reps inputs, a 48 dp ✓ and, for the
 * current / done set, the RIR 0-3 selector. Empty inputs on ✓ use the previous value (see
 * `resolveSetValues`); the placeholders show which value that will be.
 */
function SetRowBase({
  index,
  exerciseName,
  status,
  bodyweight,
  previous,
  placeholder,
  logged,
  holdSec,
  onHold,
  onToggle,
  onRir,
}: SetRowProps) {
  const theme = useTheme();
  const t = useT();
  const language = useLocaleStore((state) => state.language);
  const { width } = useWindowDimensions();
  const [errors, setErrors] = useState<InputErrors>(NO_ERRORS);
  const [weightText, setWeightText] = useState('');
  const [repsText, setRepsText] = useState('');
  const [rirChoice, setRirChoice] = useState<number | null>(null);
  const done = status === 'done';
  const number = index + 1;
  const showPrevious = width >= NARROW_WIDTH;

  const input = (editable: boolean, invalid: boolean) => ({
    ...theme.text('body-strong'),
    minHeight: theme.touch.gym,
    flex: 1,
    textAlign: 'center' as const,
    color: theme.color.text,
    borderRadius: theme.radius.sm,
    borderWidth: theme.stroke.bold,
    borderColor: invalid
      ? theme.color.error
      : status === 'current'
        ? theme.color.brand
        : theme.color.border,
    backgroundColor: editable ? theme.color.surface : theme.color.brandSoft,
    paddingHorizontal: theme.space[1],
  });

  const weightValue = done
    ? logged?.weightKg != null
      ? formatKg(logged.weightKg, language)
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
              value: previousText(previous, bodyweight, language),
            })}
            style={[
              theme.text('caption'),
              { width: theme.space[10] + theme.space[4], color: theme.color.textMuted },
            ]}
          >
            {previousText(previous, bodyweight, language)}
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
            onChangeText={(text) => {
              setWeightText(text);
              if (errors.weight) setErrors((current) => ({ ...current, weight: false }));
            }}
            placeholder={
              placeholder.weightKg === null ? '' : formatKg(placeholder.weightKg, language)
            }
            placeholderTextColor={theme.color.textMuted}
            style={input(!done, errors.weight)}
          />
        )}
        <TextInput
          accessibilityLabel={t('gym.session.repsLabel', { n: number, exercise: exerciseName })}
          inputMode="numeric"
          keyboardType="numeric"
          editable={!done}
          selectTextOnFocus
          value={repsValue}
          onChangeText={(text) => {
            setRepsText(text);
            if (errors.reps) setErrors((current) => ({ ...current, reps: false }));
          }}
          placeholder={placeholder.reps === null ? '' : String(placeholder.reps)}
          placeholderTextColor={theme.color.textMuted}
          style={input(!done, errors.reps)}
        />
        {holdSec !== undefined && onHold && !done ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('gym.session.holdStart', { sec: holdSec })}
            onPress={() => onHold(index)}
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
            if (!done) {
              // Invalid text is reported, never replaced silently by the previous value.
              const found = validateSetInputs({ weightText, repsText }, bodyweight);
              if (found.weight || found.reps) {
                setErrors(found);
                return;
              }
            }
            setErrors(NO_ERRORS);
            onToggle(index, { weightText, repsText, rir: rirChoice });
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

      {errors.weight || errors.reps ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.text('caption'), { color: theme.color.error }]}
        >
          {t(errors.weight ? 'gym.session.invalidWeight' : 'gym.session.invalidReps')}
        </Text>
      ) : null}

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
                  if (done) onRir(index, next);
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

/** Memoized: a row re-renders only when its own props change (callbacks must be stable). */
export const SetRow = memo(SetRowBase);

import { memo, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions, type TextInput } from 'react-native';
import { Check, Info, Timer } from 'phosphor-react-native';

import { useLocaleStore, useT } from '../i18n';
import type { Language } from '../i18n/types';
import { ThemedTextInput } from '../ui/TextField';
import { useTheme, type Theme } from '../ui/theme';

import {
  formatKg,
  validateSetInputs,
  type InputErrors,
  type PreviousSet,
  type SetInputs,
} from './sessionViewModel';
import { useScrollIntoView } from './sessionScroll';
import { NO_PREVIOUS, type SetField } from './setRowLayout';

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
  /** Keyboard chaining: the card keeps the inputs and moves focus kg -> reps -> next set. */
  registerInput?: (index: number, field: SetField, input: TextInput | null) => void;
  onSubmitInput?: (index: number, field: SetField) => void;
  /** Return key of the reps input: `next` when another set follows, else `done`. */
  repsReturnKey?: 'next' | 'done';
  /** Opens the short "what is RIR" sheet. */
  onRirInfo?: () => void;
};

const RIR_VALUES = [0, 1, 2, 3] as const;
/** Below this window width the "anterior" column is hidden (the header follows the same rule). */
export const NARROW_WIDTH = 360;

function previousText(previous: PreviousSet, bodyweight: boolean, language: Language): string {
  if (previous.reps === null) return NO_PREVIOUS;
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
  registerInput,
  onSubmitInput,
  repsReturnKey = 'done',
  onRirInfo,
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
  const rowRef = useRef<View>(null);
  const scrollIntoView = useScrollIntoView();
  const onFocus = () => scrollIntoView(rowRef.current);

  const input = (editable: boolean, invalid: boolean) => ({
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
    <View ref={rowRef} style={{ gap: theme.space[2] }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[2],
          minHeight: theme.control.lg,
        }}
      >
        <Text
          style={[
            theme.text('body-strong'),
            { width: theme.space[8], color: theme.color.text, textAlign: 'center' },
          ]}
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
              {
                width: PREVIOUS_WIDTH(theme),
                color: theme.color.textMuted,
                textAlign: 'center',
              },
            ]}
          >
            {previousText(previous, bodyweight, language)}
          </Text>
        ) : null}
        {bodyweight ? null : (
          <ThemedTextInput
            variant="body-strong"
            accessibilityLabel={t('gym.session.weightLabel', { n: number, exercise: exerciseName })}
            inputMode="decimal"
            keyboardType="numeric"
            editable={!done}
            selectTextOnFocus
            ref={(input) => registerInput?.(index, 'weight', input)}
            onFocus={onFocus}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => onSubmitInput?.(index, 'weight')}
            value={weightValue}
            onChangeText={(text) => {
              setWeightText(text);
              if (errors.weight) setErrors((current) => ({ ...current, weight: false }));
            }}
            placeholder={
              placeholder.weightKg === null ? '' : formatKg(placeholder.weightKg, language)
            }
            style={input(!done, errors.weight)}
          />
        )}
        <ThemedTextInput
          variant="body-strong"
          accessibilityLabel={t('gym.session.repsLabel', { n: number, exercise: exerciseName })}
          inputMode="numeric"
          keyboardType="numeric"
          editable={!done}
          selectTextOnFocus
          ref={(input) => registerInput?.(index, 'reps', input)}
          onFocus={onFocus}
          returnKeyType={repsReturnKey}
          submitBehavior={repsReturnKey === 'next' ? 'submit' : 'blurAndSubmit'}
          onSubmitEditing={() => onSubmitInput?.(index, 'reps')}
          value={repsValue}
          onChangeText={(text) => {
            setRepsText(text);
            if (errors.reps) setErrors((current) => ({ ...current, reps: false }));
          }}
          placeholder={placeholder.reps === null ? '' : String(placeholder.reps)}
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
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: theme.space[2],
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('gym.session.rirInfoLabel')}
            onPress={onRirInfo}
            disabled={!onRirInfo}
            hitSlop={theme.space[1]}
            style={{
              minHeight: theme.touch.min,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space[1],
              paddingHorizontal: theme.space[1],
            }}
          >
            <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
              {t('gym.session.rirShort')}
            </Text>
            <Info size={theme.space[5]} color={theme.color.textMuted} />
          </Pressable>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('gym.session.rirTitle')}
            style={{ flexDirection: 'row', gap: theme.space[2] }}
          >
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
                    width: theme.touch.min,
                    height: theme.touch.min,
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
        </View>
      )}
    </View>
  );
}

/** Width of the "anterior" column (row and header). */
function PREVIOUS_WIDTH(theme: Theme): number {
  return theme.space[10] + theme.space[4];
}

/**
 * Column headers over the set rows: Serie · Anterior · kg · reps · ✓, with the same widths and
 * rules as `SetRow` (no "anterior" on narrow screens, no kg for bodyweight). Decorative for screen
 * readers: every input already has its own label.
 */
export function SetHeader({ bodyweight, hold }: { bodyweight: boolean; hold: boolean }) {
  const theme = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const header = (label: string, style: object) => (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      style={[theme.text('caption'), { color: theme.color.textMuted, textAlign: 'center' }, style]}
    >
      {label}
    </Text>
  );
  return (
    <View
      testID="set-header"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}
    >
      {header(t('gym.session.colSet'), { width: theme.space[8] })}
      {width >= NARROW_WIDTH
        ? header(t('gym.session.colPrevious'), { width: PREVIOUS_WIDTH(theme) })
        : null}
      {bodyweight ? null : header(t('gym.session.colKg'), { flex: 1 })}
      {header(t('gym.session.colReps'), { flex: 1 })}
      {hold ? <View style={{ width: theme.touch.gym }} /> : null}
      <View style={{ width: theme.touch.gym, alignItems: 'center' }}>
        <Check size={theme.space[4]} weight="bold" color={theme.color.textMuted} />
      </View>
    </View>
  );
}

/** Memoized: a row re-renders only when its own props change (callbacks must be stable). */
export const SetRow = memo(SetRowBase);

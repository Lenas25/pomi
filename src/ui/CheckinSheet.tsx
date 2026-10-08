import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Minus,
  Plus,
  Smiley,
  SmileyBlank,
  SmileyMeh,
  SmileySad,
  SmileyWink,
} from 'phosphor-react-native';
import type { Icon } from 'phosphor-react-native';

import { adjustClock, TIME_ADJUST_MIN, type AnswerValue } from '../domain/habits/checkins';
import { useT, type TranslationKey } from '../i18n';
import type { CheckinQuestion } from '../templates/schema';
import { Button } from './Button';
import { TextField } from './TextField';
import { useTheme } from './theme';

/** Faces for a 1-5 scale, from worst to best (HANDOFF §4). */
const FACES: readonly { icon: Icon; key: TranslationKey }[] = [
  { icon: SmileySad, key: 'checkin.scaleFaces.f1' },
  { icon: SmileyMeh, key: 'checkin.scaleFaces.f2' },
  { icon: SmileyBlank, key: 'checkin.scaleFaces.f3' },
  { icon: Smiley, key: 'checkin.scaleFaces.f4' },
  { icon: SmileyWink, key: 'checkin.scaleFaces.f5' },
];

type ScaleQuestion = Extract<CheckinQuestion, { type: 'scale' }>;

function ScaleInput({
  question,
  value,
  onChange,
}: {
  question: ScaleQuestion;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const [min, max] = question.scale;
  const options = Array.from({ length: max - min + 1 }, (_unused, index) => min + index);
  const hasFaces = options.length === FACES.length;

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={question.label}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[3] }}
    >
      {options.map((option, index) => {
        const selected = value === option;
        const face = hasFaces ? FACES[index] : undefined;
        const FaceIcon = face?.icon;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={
              face
                ? t('checkin.scaleOption', { value: option, max, face: t(face.key) })
                : t('checkin.scaleFallback', { value: option })
            }
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option)}
            style={({ pressed }) => ({
              width: theme.touch.gym,
              height: theme.touch.gym,
              borderRadius: theme.radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              // The selected state is shown with a thicker border AND a filled face, not color only.
              borderWidth: selected ? theme.stroke.accent : theme.stroke.bold,
              borderColor: selected ? theme.color.brand : theme.color.border,
              backgroundColor: selected ? theme.color.brandSoft : theme.color.surface,
              opacity: pressed ? theme.opacity.pressed : 1,
            })}
          >
            {FaceIcon ? (
              <FaceIcon
                color={selected ? theme.color.brand : theme.color.textMuted}
                weight={selected ? 'fill' : 'bold'}
              />
            ) : (
              <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>{option}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function TimeInput({
  question,
  value,
  onChange,
}: {
  question: Extract<CheckinQuestion, { type: 'time' }>;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const current = typeof value === 'string' ? value : undefined;
  const shift = (delta: number) => {
    if (current !== undefined) onChange(adjustClock(current, delta));
  };
  const button = (kind: 'minus' | 'plus') => {
    const Glyph = kind === 'plus' ? Plus : Minus;
    const label = t(kind === 'plus' ? 'checkin.laterLabel' : 'checkin.earlierLabel', {
      label: question.label,
    });
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: current === undefined }}
        disabled={current === undefined}
        onPress={() => shift(kind === 'plus' ? TIME_ADJUST_MIN : -TIME_ADJUST_MIN)}
        style={({ pressed }) => ({
          width: theme.touch.gym,
          height: theme.touch.gym,
          borderRadius: theme.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.color.surface,
          borderColor: theme.color.border,
          borderWidth: theme.stroke.hairline,
          opacity:
            current === undefined ? theme.opacity.disabled : pressed ? theme.opacity.pressed : 1,
        })}
      >
        <Glyph color={theme.color.text} />
      </Pressable>
    );
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
      {button('minus')}
      <Text
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('checkin.adjust', {
          label: question.label,
          time: current ?? '--:--',
        })}
        style={[
          theme.text('title-md'),
          { color: theme.color.text, minWidth: theme.touch.gym * 2, textAlign: 'center' },
        ]}
      >
        {current ?? '--:--'}
      </Text>
      {button('plus')}
    </View>
  );
}

type CheckinSheetProps = {
  questions: readonly CheckinQuestion[];
  answers: Readonly<Record<string, AnswerValue | undefined>>;
  onAnswer: (id: string, value: AnswerValue) => void;
  onSubmit: () => void;
  submitting: boolean;
  /** Translated error under the button (validation or save failure). */
  error?: string | undefined;
  /** Extra fields below the template questions (the food note when that module is active). */
  extra?: ReactNode;
};

/**
 * Check-in form (HANDOFF §4): times prefilled and adjustable by 15 min with one tap, 1-5 scales
 * as 48 dp circles with a face, optional note. Question texts come from the template.
 */
export function CheckinSheet({
  questions,
  answers,
  onAnswer,
  onSubmit,
  submitting,
  error,
  extra,
}: CheckinSheetProps) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={{ gap: theme.space[5] }}>
      {questions.map((question) => {
        const answer = answers[question.id];
        return (
          <View key={question.id} style={{ gap: theme.space[2] }}>
            {question.type !== 'text' ? (
              <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                {question.label}
              </Text>
            ) : null}
            {question.type === 'scale' ? (
              <ScaleInput
                question={question}
                value={typeof answer === 'number' ? answer : undefined}
                onChange={(value) => onAnswer(question.id, value)}
              />
            ) : question.type === 'time' ? (
              <TimeInput
                question={question}
                value={typeof answer === 'string' ? answer : undefined}
                onChange={(value) => onAnswer(question.id, value)}
              />
            ) : (
              <TextField
                label={question.label}
                value={typeof answer === 'string' ? answer : ''}
                onChangeText={(value) => onAnswer(question.id, value)}
              />
            )}
          </View>
        );
      })}
      {extra}
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.text('body'), { color: theme.color.error }]}
        >
          {error}
        </Text>
      ) : null}
      <Button label={t('checkin.save')} onPress={onSubmit} loading={submitting} size="lg" />
    </View>
  );
}

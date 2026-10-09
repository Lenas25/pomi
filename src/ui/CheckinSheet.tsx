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
import { useTemplateText } from '../i18n/templateText';
import type { CheckinQuestion } from '../templates/schema';
import { Button } from './Button';
import { TextField } from './TextField';
import { FACE_KEYS } from '../checkin/checkinSteps';
import { useTheme, type SectionKey } from './theme';

/** Faces for a 1-5 scale, from worst to best (HANDOFF §4). */
const FACE_ICONS: readonly Icon[] = [SmileySad, SmileyMeh, SmileyBlank, Smiley, SmileyWink];
const FACES: readonly { icon: Icon; key: TranslationKey }[] = FACE_ICONS.map((icon, index) => ({
  icon,
  key: FACE_KEYS[index] ?? 'checkin.scaleFaces.f1',
}));

type ScaleQuestion = Extract<CheckinQuestion, { type: 'scale' }>;

function ScaleInput({
  question,
  value,
  onChange,
  section,
}: {
  section: SectionKey;
  question: ScaleQuestion;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const text = useTemplateText();
  const colors = theme.section[section];
  const [min, max] = question.scale;
  const options = Array.from({ length: max - min + 1 }, (_unused, index) => min + index);
  const hasFaces = options.length === FACES.length;

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={text(question.label)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}
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
              // Big tappable chips: five share the row (wrap at large font sizes).
              flexGrow: 1,
              flexBasis: theme.touch.gym,
              minWidth: theme.touch.gym,
              minHeight: theme.touch.gym * 1.75,
              paddingVertical: theme.space[2],
              paddingHorizontal: theme.space[1],
              gap: theme.space[1],
              borderRadius: theme.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              // The selected state is shown with a thicker border AND a filled face, not color only.
              borderWidth: selected ? theme.stroke.accent : theme.stroke.bold,
              borderColor: selected ? colors.text : theme.color.border,
              backgroundColor: selected ? colors.soft : theme.color.surface,
              opacity: pressed ? theme.opacity.pressed : 1,
            })}
          >
            {FaceIcon ? (
              <FaceIcon
                size={theme.icon.size * 1.25}
                color={selected ? colors.text : theme.color.textMuted}
                weight={selected ? 'fill' : 'bold'}
              />
            ) : null}
            <Text
              numberOfLines={2}
              style={[
                theme.text(face ? 'caption' : 'body-strong'),
                { color: theme.color.text, textAlign: 'center' },
              ]}
            >
              {face ? t(face.key) : option}
            </Text>
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
  const text = useTemplateText();
  const current = typeof value === 'string' ? value : undefined;
  const shift = (delta: number) => {
    if (current !== undefined) onChange(adjustClock(current, delta));
  };
  const button = (kind: 'minus' | 'plus') => {
    const Glyph = kind === 'plus' ? Plus : Minus;
    const label = t(kind === 'plus' ? 'checkin.laterLabel' : 'checkin.earlierLabel', {
      label: text(question.label),
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
          opacity:
            current === undefined ? theme.opacity.disabled : pressed ? theme.opacity.pressed : 1,
        })}
      >
        <Glyph color={theme.color.text} />
      </Pressable>
    );
  };

  // Compact HH:MM control: − 15 min · time · + 15 min in one pill.
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: theme.space[1],
        borderRadius: theme.radius.pill,
        borderWidth: theme.stroke.hairline,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surface,
      }}
    >
      {button('minus')}
      <Text
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('checkin.adjust', {
          label: text(question.label),
          time: current ?? '--:--',
        })}
        style={[
          theme.text('metric-sm'),
          { color: theme.color.text, minWidth: theme.touch.gym * 1.75, textAlign: 'center' },
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
  /** Label of the main button (default "Listo"). */
  submitLabel?: string;
  /** Color of the selected faces (the check-in's section). */
  section?: SectionKey;
};

/**
 * Check-in questions (HANDOFF §4): times prefilled in a compact HH:MM pill adjustable by 15 min
 * with one tap, 1-5 scales as big face chips with a word ("Mal · Regular · Bien · Muy bien ·
 * Genial"), optional note. Question texts come from the template.
 */
export function CheckinSheet({
  questions,
  answers,
  onAnswer,
  onSubmit,
  submitting,
  error,
  extra,
  submitLabel,
  section = 'sueno',
}: CheckinSheetProps) {
  const theme = useTheme();
  const t = useT();
  const text = useTemplateText();
  return (
    <View style={{ gap: theme.space[5] }}>
      {questions.map((question) => {
        const answer = answers[question.id];
        return (
          <View key={question.id} style={{ gap: theme.space[2] }}>
            {question.type !== 'text' ? (
              <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                {text(question.label)}
              </Text>
            ) : null}
            {question.type === 'scale' ? (
              <ScaleInput
                section={section}
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
                label={text(question.label)}
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
      <Button
        label={submitLabel ?? t('checkin.save')}
        onPress={onSubmit}
        loading={submitting}
        size="lg"
      />
    </View>
  );
}

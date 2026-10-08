import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';

import { useT } from '../i18n';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/theme';
import {
  isFirstQuestion,
  nextHref,
  questionNumber,
  TOTAL_QUESTIONS,
  type QuestionId,
} from './flow';

type QuestionScreenProps = {
  id: QuestionId;
  title: string;
  hint?: string;
  /** Rendered above the title (the mascot on the first screen). */
  header?: ReactNode;
  children: ReactNode;
  /** Called on "Siguiente". Return `false` to stay on the screen (e.g. invalid input). */
  onNext?: () => boolean;
  /** Called on "Saltar" to clear the answer before moving on. */
  onSkip?: () => void;
};

/**
 * Shell shared by every question: progress, back, title, content, "Siguiente" and "Saltar".
 * Keyboard-safe (KeyboardAvoidingView + a scroll view that keeps taps working while typing).
 */
export function QuestionScreen({
  id,
  title,
  hint,
  header,
  children,
  onNext,
  onSkip,
}: QuestionScreenProps) {
  const theme = useTheme();
  const t = useT();
  const router = useRouter();

  const goNext = () => router.push(nextHref(id));
  const handleNext = () => {
    if (onNext && !onNext()) return;
    goNext();
  };
  const handleSkip = () => {
    onSkip?.();
    goNext();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.color.bg }}
    >
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space[3],
            paddingVertical: theme.space[2],
          }}
        >
          {isFirstQuestion(id) ? (
            <View style={{ width: theme.touch.gym }} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.back')}
              onPress={() => router.back()}
              style={{
                width: theme.touch.gym,
                height: theme.touch.gym,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowLeft color={theme.color.text} />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <ProgressBar
              current={questionNumber(id)}
              total={TOTAL_QUESTIONS}
              label={t('onboarding.progress', {
                current: questionNumber(id),
                total: TOTAL_QUESTIONS,
              })}
            />
          </View>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: theme.space[5], paddingVertical: theme.space[4] }}
          style={{ flex: 1 }}
        >
          {header}
          <View style={{ gap: theme.space[2] }}>
            <Text
              accessibilityRole="header"
              style={[theme.text('title-lg'), { color: theme.color.text }]}
            >
              {title}
            </Text>
            {hint ? (
              <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>{hint}</Text>
            ) : null}
          </View>
          {children}
        </ScrollView>

        <View style={{ gap: theme.space[2], paddingVertical: theme.space[3] }}>
          <Button label={t('onboarding.next')} onPress={handleNext} size="lg" />
          <Button label={t('onboarding.skip')} onPress={handleSkip} variant="ghost" />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

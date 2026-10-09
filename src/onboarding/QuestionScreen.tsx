import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useT } from '../i18n';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { Screen } from '../ui/Screen';
import { StepHeader } from '../ui/StepHeader';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';
import {
  isFirstQuestion,
  nextHref,
  questionNumber,
  TOTAL_QUESTIONS,
  type QuestionId,
} from './flow';
import { hiddenScrollIndicators } from '../ui/scroll';

const NextContext = createContext<() => void>(() => undefined);

/** A TextField whose keyboard submit key acts as "Siguiente" (unless `onSubmitEditing` is given). */
export function QuestionTextField(props: ComponentProps<typeof TextField>) {
  const next = useContext(NextContext);
  return <TextField onSubmitEditing={next} {...props} />;
}

/** How long taps are ignored after moving to the next question (covers the stack transition). */
const NAVIGATION_LOCK_MS = 600;

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
  /** One short line shown right above the pinned buttons (never hidden behind them). */
  footerNote?: string;
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
  footerNote,
}: QuestionScreenProps) {
  const theme = useTheme();
  const t = useT();
  const router = useRouter();

  // Re-entry guard: a double tap (or Next + Skip) must not push the next question twice. The
  // screen stays mounted under the pushed one, so the lock is released after the transition.
  const navigating = useRef(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(unlockTimer.current), []);
  const goNext = useCallback(() => {
    if (navigating.current) return false;
    navigating.current = true;
    unlockTimer.current = setTimeout(() => {
      navigating.current = false;
    }, NAVIGATION_LOCK_MS);
    router.push(nextHref(id));
    return true;
  }, [id, router]);
  const handleNext = () => {
    if (navigating.current) return;
    if (onNext && !onNext()) return;
    goNext();
  };
  const handleSkip = () => {
    if (navigating.current) return;
    onSkip?.();
    goNext();
  };

  return (
    <NextContext.Provider value={handleNext}>
      <KeyboardAvoidingView
        // Android is edge-to-edge in SDK 57, so the window no longer resizes for the keyboard and
        // `behavior` must be set on both platforms (React Native KeyboardAvoidingView docs).
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: theme.color.bg }}
      >
        <Screen edges={['top', 'bottom', 'left', 'right']}>
          <View style={{ paddingVertical: theme.space[2] }}>
            <StepHeader
              backLabel={t('onboarding.back')}
              onBack={isFirstQuestion(id) ? undefined : () => router.back()}
            >
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
            </StepHeader>
          </View>

          <ScrollView
            {...hiddenScrollIndicators}
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
            {footerNote ? (
              <Text
                numberOfLines={2}
                style={[
                  theme.text('caption'),
                  { color: theme.color.textMuted, textAlign: 'center' },
                ]}
              >
                {footerNote}
              </Text>
            ) : null}
            <Button label={t('onboarding.next')} onPress={handleNext} size="lg" />
            <Button label={t('onboarding.skip')} onPress={handleSkip} variant="ghost" />
          </View>
        </Screen>
      </KeyboardAvoidingView>
    </NextContext.Provider>
  );
}

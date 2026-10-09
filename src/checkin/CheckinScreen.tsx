import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import { getDatabase, getRepositories } from '../db';
import type { AnswerValue, CheckinKind } from '../domain/habits/checkins';
import { dayKeyFor } from '../domain/time';
import { useT } from '../i18n';
import { Button } from '../ui/Button';
import { CheckinSheet } from '../ui/CheckinSheet';
import { EmptyState } from '../ui/EmptyState';
import { Mascot } from '../ui/Mascot';
import { MascotBubble } from '../ui/MascotBubble';
import { Screen } from '../ui/Screen';
import { StepHeader } from '../ui/StepHeader';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';
import { templateText } from '../i18n/templateText';
import { requestNotificationSync } from '../notifications/sync';
import { loadCheckin, saveCheckin, type CheckinPlan, type LoadedCheckin } from './checkinFlow';
import { CheckinStepIndicator } from './CheckinStepIndicator';
import { checkinSteps, checkinSummary } from './checkinSteps';

type Load = { status: 'loading' } | { status: 'error' } | LoadedCheckin;

/** Closes the check-in without ever emptying the stack (opened cold from a notification). */
export function leaveCheckin(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/habitos');
}

const SECTION = 'sueno' as const;

/**
 * Morning / night check-in (PLAN §10): prefilled, a couple of taps, done in under 10 seconds.
 * Steps with an icon indicator (Sueño · Calidad · Listo): the times, then the face scales and the
 * note, then a short summary ("Dormiste 7 h 10 · calidad Bien"). The back slot never moves.
 */
export function CheckinScreen({ kind }: { kind: CheckinKind }) {
  const theme = useTheme();
  const t = useT();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [answers, setAnswers] = useState<Record<string, AnswerValue | undefined>>({});
  const [foodNote, setFoodNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // Captured once at open: prefill and save always target the same day, even across the rollover.
  const [day] = useState(() => dayKeyFor(new Date()));

  useEffect(() => {
    let cancelled = false;
    loadCheckin(getRepositories(), kind, day).then(
      (loaded) => {
        if (cancelled) return;
        if (loaded.status === 'ready') {
          setAnswers(loaded.plan.answers);
          setFoodNote(loaded.plan.foodNote);
        }
        setLoad(loaded);
      },
      (failure: unknown) => {
        if (__DEV__) console.error('Could not load the check-in', failure);
        if (!cancelled) setLoad({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kind, day]);

  const submit = useCallback(
    async (plan: CheckinPlan) => {
      setSubmitting(true);
      setError(undefined);
      try {
        const result = await saveCheckin(
          getDatabase(),
          getRepositories(),
          plan,
          day,
          answers,
          foodNote,
        );
        if (!result.ok) {
          setError(t('checkin.missing', { question: templateText(result.question.label) }));
          return;
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void requestNotificationSync('dataChanged');
        setDone(true);
      } catch (failure) {
        if (__DEV__) console.error('Could not save the check-in', failure);
        setError(t('checkin.saveError'));
      } finally {
        setSubmitting(false);
      }
    },
    [answers, day, foodNote, t],
  );

  const title = t(kind === 'morning' ? 'checkin.morningTitle' : 'checkin.nightTitle');
  const pose = kind === 'morning' ? 'hola' : 'descansa';
  const questions = load.status === 'ready' ? load.plan.questions : null;
  const steps = useMemo(() => (questions ? checkinSteps(questions) : []), [questions]);
  const stepIds = steps.map((step) => step.id);

  if (load.status === 'loading')
    return <Screen edges={['top', 'bottom', 'left', 'right']}>{null}</Screen>;
  if (load.status !== 'ready') {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <EmptyState
          title={t(load.status === 'disabled' ? 'checkin.disabled' : 'checkin.loadError')}
          body={t(load.status === 'disabled' ? 'checkin.disabledBody' : 'checkin.loadErrorBody')}
          action={{ label: t('checkin.close'), onPress: leaveCheckin }}
        />
      </Screen>
    );
  }

  const { plan } = load;
  const lastQuestionStep = steps.length - 2;

  if (done) {
    const summary = checkinSummary(kind, plan.questions, answers)
      .map((part) =>
        t(part.key, {
          ...part.params,
          face: part.faceKey ? t(part.faceKey) : '',
        }),
      )
      .join(' · ');
    const line = summary.charAt(0).toUpperCase() + summary.slice(1);
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ gap: theme.space[5], paddingVertical: theme.space[4], flex: 1 }}>
          <StepHeader backLabel={t('checkin.close')}>
            <CheckinStepIndicator
              kind={kind}
              steps={stepIds}
              current={steps.length - 1}
              section={SECTION}
            />
          </StepHeader>
          <View style={{ flex: 1, justifyContent: 'center', gap: theme.space[5] }}>
            <MascotBubble
              pose={pose}
              message={t(kind === 'morning' ? 'checkin.doneMorning' : 'checkin.doneNight')}
              size="lg"
            />
            {line ? (
              <Text
                testID="checkin-summary"
                accessibilityLiveRegion="polite"
                style={[theme.text('title-md'), { color: theme.color.text, textAlign: 'center' }]}
              >
                {line}
              </Text>
            ) : null}
          </View>
          <Button label={t('checkin.save')} onPress={leaveCheckin} size="lg" />
        </View>
      </Screen>
    );
  }

  const current = Math.min(stepIndex, Math.max(0, lastQuestionStep));
  const step = steps[current];
  const isLast = current >= lastQuestionStep;
  return (
    <KeyboardAvoidingView
      // Android is edge-to-edge in SDK 57: set `behavior` on both platforms.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: theme.color.bg }}
    >
      <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ gap: theme.space[5], paddingVertical: theme.space[4] }}>
          <StepHeader
            backLabel={current === 0 ? t('checkin.close') : t('checkin.back')}
            onBack={current === 0 ? leaveCheckin : () => setStepIndex(current - 1)}
          >
            <CheckinStepIndicator kind={kind} steps={stepIds} current={current} section={SECTION} />
          </StepHeader>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            <Mascot pose={pose} size="sm" />
            <Text
              accessibilityRole="header"
              style={[theme.text('title-lg'), { color: theme.color.text, flex: 1 }]}
            >
              {title}
            </Text>
          </View>
          <CheckinSheet
            key={step?.id ?? 'none'}
            section={SECTION}
            questions={step?.questions ?? []}
            answers={answers}
            onAnswer={(id, value) =>
              setAnswers((currentAnswers) => ({ ...currentAnswers, [id]: value }))
            }
            onSubmit={() => (isLast ? void submit(plan) : setStepIndex(current + 1))}
            submitLabel={isLast ? t('checkin.save') : t('checkin.next')}
            submitting={submitting}
            error={error}
            extra={
              isLast && plan.foodPrompt !== null ? (
                <TextField label={plan.foodPrompt} value={foodNote} onChangeText={setFoodNote} />
              ) : null
            }
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

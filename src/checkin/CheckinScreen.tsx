import { useCallback, useEffect, useState } from 'react';
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

type Load = { status: 'loading' } | { status: 'error' } | LoadedCheckin;

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/habitos');
}

/** Morning / night check-in (PLAN §10): prefilled, a couple of taps, done in under 10 seconds. */
export function CheckinScreen({ kind }: { kind: CheckinKind }) {
  const theme = useTheme();
  const t = useT();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [answers, setAnswers] = useState<Record<string, AnswerValue | undefined>>({});
  const [foodNote, setFoodNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);
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

  if (load.status === 'loading')
    return <Screen edges={['top', 'bottom', 'left', 'right']}>{null}</Screen>;
  if (load.status !== 'ready') {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <EmptyState
          title={t(load.status === 'disabled' ? 'checkin.disabled' : 'checkin.loadError')}
          body={t(load.status === 'disabled' ? 'checkin.disabledBody' : 'checkin.loadErrorBody')}
          action={{ label: t('checkin.close'), onPress: leave }}
        />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ flex: 1, justifyContent: 'center', gap: theme.space[6] }}>
          <MascotBubble
            pose={kind === 'morning' ? 'hola' : 'descansa'}
            message={t(kind === 'morning' ? 'checkin.doneMorning' : 'checkin.doneNight')}
            size="lg"
          />
          <Button label={t('checkin.close')} onPress={leave} variant="secondary" size="lg" />
        </View>
      </Screen>
    );
  }

  const { plan } = load;
  return (
    <KeyboardAvoidingView
      // Android is edge-to-edge in SDK 57: set `behavior` on both platforms.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: theme.color.bg }}
    >
      <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ gap: theme.space[5], paddingVertical: theme.space[4] }}>
          <StepHeader backLabel={t('checkin.close')} onBack={leave}>
            <Mascot pose={kind === 'morning' ? 'hola' : 'descansa'} size="sm" />
            <Text
              accessibilityRole="header"
              style={[theme.text('title-lg'), { color: theme.color.text, flex: 1 }]}
            >
              {title}
            </Text>
          </StepHeader>
          <CheckinSheet
            questions={plan.questions}
            answers={answers}
            onAnswer={(id, value) => setAnswers((current) => ({ ...current, [id]: value }))}
            onSubmit={() => void submit(plan)}
            submitting={submitting}
            error={error}
            extra={
              plan.foodPrompt === null ? null : (
                <TextField label={plan.foodPrompt} value={foodNote} onChangeText={setFoodNote} />
              )
            }
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

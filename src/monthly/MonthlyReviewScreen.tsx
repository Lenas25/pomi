import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';

import { getDatabase, getRepositories } from '../db';
import { parseMetricInput } from '../domain/progress/metrics';
import { dayKeyFor } from '../domain/time';
import { formatKg } from '../gym/sessionViewModel';
import { useLocaleStore, useT } from '../i18n';
import { requestNotificationSync } from '../notifications/sync';
import { expoPhotoFs } from '../photos/expoPhotoFs';
import { savePhoto } from '../photos/photoStore';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { MascotBubble } from '../ui/MascotBubble';
import { Screen } from '../ui/Screen';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';

import {
  finishMonthly,
  loadMonthlyContext,
  saveMonthlyMeasurements,
  type MonthlyContext,
} from './monthlyFlow';
import { PhotoStep } from './PhotoStep';

type Step = 'intro' | 'measures' | 'photos' | 'done';
type Load =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; context: MonthlyContext };

/** Template poses are lowercase ids ("frente"); show them capitalized. */
const poseName = (pose: string) => pose.charAt(0).toUpperCase() + pose.slice(1);

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/progreso');
}

/**
 * Monthly review (PLAN §10): weight and measurements, then one photo per pose with the previous one
 * faded on top, then the way to "Tú hace 30 días vs. hoy". Every step can be skipped.
 */
export function MonthlyReviewScreen() {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [step, setStep] = useState<Step>('intro');
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [poseIndex, setPoseIndex] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);
  // Captured once at open: every save of the review targets the same day.
  const [day] = useState(() => dayKeyFor(new Date()));

  useEffect(() => {
    let cancelled = false;
    loadMonthlyContext(getRepositories(), expoPhotoFs, day).then(
      (context) => {
        if (!cancelled) setLoad({ status: 'ready', context });
      },
      (failure: unknown) => {
        if (__DEV__) console.error('Could not load the monthly review', failure);
        if (!cancelled) setLoad({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [day]);

  const finish = useCallback(
    async (count: number) => {
      try {
        await finishMonthly(getDatabase(), getRepositories(), day, count);
        void requestNotificationSync('dataChanged');
      } catch (failure) {
        if (__DEV__) console.error('Could not close the monthly review', failure);
      }
      setStep('done');
    },
    [day],
  );

  if (load.status === 'loading')
    return <Screen edges={['top', 'bottom', 'left', 'right']}>{null}</Screen>;
  if (load.status === 'error') {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <EmptyState
          title={t('monthly.loadFailed')}
          body=""
          action={{ label: t('monthly.done.close'), onPress: leave }}
        />
      </Screen>
    );
  }
  const { context } = load;

  const submitMeasures = async () => {
    const nextErrors: Record<string, string> = {};
    const parsedValues: Record<string, number> = {};
    for (const metric of context.metrics) {
      const text = values[metric.id] ?? '';
      if (text.trim() === '') continue;
      const parsed = parseMetricInput(text, metric.unit);
      if (parsed.ok) parsedValues[metric.id] = parsed.value;
      else {
        nextErrors[metric.id] =
          parsed.reason === 'outOfRange'
            ? t('monthly.measures.outOfRange')
            : t('monthly.measures.invalid');
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    setSaveError(false);
    try {
      if (Object.keys(parsedValues).length > 0) {
        await saveMonthlyMeasurements(getDatabase(), getRepositories(), day, parsedValues);
      }
      goToPhotos();
    } catch (failure) {
      if (__DEV__) console.error('Could not save the measurements', failure);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const goToPhotos = () => {
    if (context.poses.length === 0) void finish(photoCount);
    else setStep('photos');
  };

  const nextPose = (count: number) => {
    if (poseIndex + 1 >= context.poses.length) void finish(count);
    else setPoseIndex(poseIndex + 1);
  };

  const pose = context.poses[poseIndex];

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ gap: theme.space[4], paddingVertical: theme.space[4] }}>
          {step === 'intro' ? (
            <>
              <MascotBubble pose="mide" message={t('monthly.intro.bubble')} />
              <Text
                accessibilityRole="header"
                style={[theme.text('title-lg'), { color: theme.color.text }]}
              >
                {t('monthly.title')}
              </Text>
              <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
                {t('monthly.intro.body')}
              </Text>
              <Button label={t('monthly.intro.start')} onPress={() => setStep('measures')} />
              <Button label={t('monthly.intro.later')} variant="ghost" onPress={leave} />
            </>
          ) : null}

          {step === 'measures' ? (
            <>
              <Text
                accessibilityRole="header"
                style={[theme.text('title-lg'), { color: theme.color.text }]}
              >
                {t('monthly.measures.title')}
              </Text>
              <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
                {t('monthly.measures.body')}
              </Text>
              {context.metrics.map((metric) => (
                <View key={metric.id} style={{ gap: theme.space[1] }}>
                  <TextField
                    label={t('monthly.measures.field', { name: metric.name, unit: metric.unit })}
                    value={values[metric.id] ?? ''}
                    onChangeText={(text) =>
                      setValues((current) => ({ ...current, [metric.id]: text }))
                    }
                    inputMode="decimal"
                    maxLength={7}
                    error={errors[metric.id]}
                  />
                  {metric.latest ? (
                    <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                      {t('monthly.measures.last', {
                        value: formatKg(metric.latest.value, language),
                        unit: metric.unit,
                        date: format(parseISO(metric.latest.date), 'd/M'),
                      })}
                    </Text>
                  ) : null}
                </View>
              ))}
              {saveError ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[theme.text('body'), { color: theme.color.error }]}
                >
                  {t('monthly.measures.saveFailed')}
                </Text>
              ) : null}
              <Button
                label={t('monthly.measures.next')}
                onPress={() => void submitMeasures()}
                loading={saving}
              />
              <Button
                label={t('monthly.measures.skip')}
                variant="ghost"
                onPress={goToPhotos}
                disabled={saving}
              />
            </>
          ) : null}

          {step === 'photos' && pose !== undefined ? (
            <PhotoStep
              key={pose}
              pose={poseName(pose)}
              current={poseIndex + 1}
              total={context.poses.length}
              guide={context.guide}
              previous={context.previous[pose]}
              onDiscard={(tempUri) => expoPhotoFs.discard(tempUri)}
              onUse={async (tempUri) => {
                await savePhoto({
                  fs: expoPhotoFs,
                  photos: getRepositories().photos,
                  tempUri,
                  date: day,
                  pose,
                  now: Date.now(),
                });
                const count = photoCount + 1;
                setPhotoCount(count);
                nextPose(count);
              }}
              onSkipPose={() => nextPose(photoCount)}
              onSkipAll={() => void finish(photoCount)}
            />
          ) : null}

          {step === 'done' ? (
            <>
              <MascotBubble pose="tranqui" message={t('monthly.done.bubble')} />
              <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
                {t('monthly.done.body')}
              </Text>
              <Button
                label={t('monthly.done.compare')}
                onPress={() => router.replace('/comparacion')}
              />
              <Button label={t('monthly.done.close')} variant="ghost" onPress={leave} />
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

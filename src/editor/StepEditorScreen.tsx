import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import {
  applyForm,
  editReps,
  formFromStep,
  otherLanguage,
  hasSubstitutions,
  type EditorErrorCode,
  type StepForm,
} from '../domain/editor';
import { useT } from '../i18n';
import { loadExerciseLibrary } from '../templates/exercises';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';

import { useEditorStore } from './editorStore';
import { errorText } from './text';
import { currentLanguage } from '../i18n/templateText';

const library = loadExerciseLibrary();

/** One step: its fields as text, validated by the same rules as the template (id never changes). */
export function StepEditorScreen() {
  const t = useT();
  const theme = useTheme();
  const { routineId, stepId } = useLocalSearchParams<{ routineId: string; stepId: string }>();
  const state = useEditorStore((store) => store.state);
  const dispatch = useEditorStore((store) => store.dispatch);

  const routine = state?.program.routines.find((candidate) => candidate.id === routineId);
  const step = routine?.steps.find((candidate) => candidate.id === stepId);
  const [form, setForm] = useState<StepForm | null>(
    step ? formFromStep(step, currentLanguage()) : null,
  );
  const [errors, setErrors] = useState<EditorErrorCode[]>([]);

  if (!routine || !step || !form) {
    return (
      <Screen>
        <EmptyState
          title={t('editor.step.notFound')}
          body={t('editor.notFoundBody')}
          action={{ label: t('editor.back'), onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const set = (field: keyof StepForm) => (value: string) =>
    setForm((current) => (current ? { ...current, [field]: value } : current));
  const errorFor = (...codes: EditorErrorCode[]) => {
    const code = errors.find((candidate) => codes.includes(candidate));
    return code ? errorText(code, t) : undefined;
  };

  const save = () => {
    const result = applyForm(step, form, currentLanguage());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    dispatch({ type: 'updateStep', routineId: routine.id, step: result.step });
    router.back();
  };

  // A new range that could not be carried into the other language: ask to review it here, so no
  // language keeps a different range (the template schema rejects that on save).
  const language = currentLanguage();
  const other = otherLanguage(language);
  const repsNeedReview =
    step.type === 'sets' && editReps(step.reps, form.reps.trim(), language).stale;

  // Always offered when the exercise has substitutions; the picker applies the equipment filters.
  const canSwap = hasSubstitutions(library, step);

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('editor.step.title')}
        </Text>
        <TextField
          label={t('editor.step.name')}
          value={form.name}
          onChangeText={set('name')}
          error={errorFor('stepNameEmpty')}
        />
        {step.type === 'sets' ? (
          <>
            <TextField
              label={t('editor.step.sets')}
              value={form.sets}
              onChangeText={set('sets')}
              inputMode="numeric"
              error={errorFor('setsInvalid')}
            />
            <TextField
              label={t('editor.step.reps')}
              value={form.reps}
              onChangeText={set('reps')}
              error={errorFor('repsInvalid')}
            />
            {repsNeedReview ? (
              <>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[theme.text('caption'), { color: theme.color.textMuted }]}
                >
                  {t(`editor.step.repsOtherNotice.${other}`)}
                </Text>
                <TextField
                  label={t(`editor.step.repsOther.${other}`)}
                  value={form.repsOther}
                  onChangeText={set('repsOther')}
                  error={errorFor('repsLanguagesDiffer')}
                />
              </>
            ) : null}
            <TextField
              label={t('editor.step.restSec')}
              value={form.restSec}
              onChangeText={set('restSec')}
              inputMode="numeric"
              error={errorFor('restInvalid')}
            />
            <TextField
              label={t('editor.step.weightHint')}
              value={form.weightHint}
              onChangeText={set('weightHint')}
            />
            <TextField
              label={t('editor.step.incrementKg')}
              value={form.incrementKg}
              onChangeText={set('incrementKg')}
              inputMode="decimal"
              error={errorFor('incrementInvalid')}
            />
          </>
        ) : null}
        {step.type === 'wait' ? (
          <TextField
            label={t('editor.step.waitSec')}
            value={form.waitSec}
            onChangeText={set('waitSec')}
            inputMode="numeric"
            error={errorFor('waitInvalid')}
          />
        ) : null}
        {step.type === 'timed' ? (
          <TextField
            label={t('editor.step.totalMin')}
            value={form.totalMin}
            onChangeText={set('totalMin')}
            inputMode="decimal"
            error={errorFor('durationInvalid')}
          />
        ) : null}
        {step.type === 'counter' ? (
          <TextField
            label={t('editor.step.target')}
            value={form.target}
            onChangeText={set('target')}
            inputMode="numeric"
            error={errorFor('targetInvalid')}
          />
        ) : null}
        <TextField
          label={t('editor.step.how')}
          value={form.how}
          onChangeText={set('how')}
          multiline
        />
        <TextField
          label={t('editor.step.muscles')}
          value={form.muscles}
          onChangeText={set('muscles')}
        />

        <Button label={t('editor.step.save')} size="lg" onPress={save} />
        {canSwap ? (
          <>
            <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
              {t('editor.step.swapNote')}
            </Text>
            <Button
              label={t('editor.step.swap')}
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/anadir-ejercicio',
                  params: { routineId: routine.id, replace: step.id },
                })
              }
            />
          </>
        ) : null}
        <Button label={t('editor.back')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

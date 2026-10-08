import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import {
  EQUIPMENT,
  LIMITATIONS,
  type Equipment,
  type Limitation,
  type TextResolver,
} from '../domain/generator/types';
import {
  addableExercises,
  carryOver,
  inferProgramEquipment,
  stepRemovalImpact,
  stepFromExercise,
  swapCandidates,
  type LibraryFilter,
} from '../domain/editor';
import { useT } from '../i18n';
import type { TranslationKey } from '../i18n';
import { loadExerciseLibrary } from '../templates/exercises';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/theme';

import { useEditorStore } from './editorStore';
import { useTemplateText } from '../i18n/templateText';

const library = loadExerciseLibrary();

const EQUIPMENT_LABELS = {
  gym: 'creator.inputs.equipment.gym',
  dumbbells: 'creator.inputs.equipment.dumbbells',
  bodyweight: 'creator.inputs.equipment.bodyweight',
} as const satisfies Record<Equipment, TranslationKey>;

const LIMITATION_LABELS = {
  knee: 'creator.inputs.limitations.knee',
  lower_back: 'creator.inputs.limitations.lower_back',
  shoulder: 'creator.inputs.limitations.shoulder',
  wrist: 'creator.inputs.limitations.wrist',
} as const satisfies Record<Limitation, TranslationKey>;

/**
 * Library exercises that can be added to a routine (or, with `replace`, swapped for the step's
 * substitutions). Same equipment and joint filters as the generator.
 */
export function ExercisePickerScreen() {
  const t = useT();
  const text = useTemplateText();
  const theme = useTheme();
  const { routineId, replace } = useLocalSearchParams<{ routineId: string; replace?: string }>();
  const source = useEditorStore((store) => store.source);
  const state = useEditorStore((store) => store.state);
  const dispatch = useEditorStore((store) => store.dispatch);
  // The profile stores no equipment or joints, so the filter starts from what the program uses.
  const [filter, setFilter] = useState<LibraryFilter>(() => ({
    equipment: state ? inferProgramEquipment(library, state.program) : 'gym',
    limitations: [],
  }));

  const resolver = useMemo<TextResolver>(
    () => (key, params) => t(key as TranslationKey, params),
    [t],
  );
  const routine = state?.program.routines.find((candidate) => candidate.id === routineId);
  const replacing = routine?.steps.find((step) => step.id === replace);
  const options = useMemo(() => {
    if (!routine) return [];
    const found = replacing
      ? swapCandidates(library, filter, routine, replacing)
      : addableExercises(library, filter, routine);
    return found
      .map((exercise) => ({ exercise, name: t(exercise.nameKey as TranslationKey) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [routine, replacing, filter, t]);

  if (!routine) {
    return (
      <Screen>
        <EmptyState
          title={t('editor.routine.notFound')}
          body={t('editor.notFoundBody')}
          action={{ label: t('editor.back'), onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    const created = stepFromExercise(option.exercise, filter, resolver);
    if (!replacing) {
      dispatch({ type: 'addStep', routineId: routine.id, step: created });
      router.back();
      return;
    }
    const step = carryOver(replacing, created);
    const apply = () => {
      dispatch({ type: 'replaceStep', routineId: routine.id, stepId: replacing.id, step });
      // Back past the step form of a swapped exercise: its old step no longer exists.
      router.back();
      router.back();
    };
    const impact =
      state && source
        ? stepRemovalImpact(state.program, routine.id, replacing.id, source.context.loggedStepIds)
        : { hasHistory: false, stillIn: [] };
    if (!impact.hasHistory) {
      apply();
      return;
    }
    const body = [
      t('editor.swap.withHistory', { name: text(replacing.name) }),
      impact.stillIn.length > 0
        ? t('editor.swap.stillIn', { routines: impact.stillIn.map(text).join(', ') })
        : t('editor.swap.historyLost'),
    ].join(' ');
    Alert.alert(t('editor.swap.title'), body, [
      { text: t('editor.swap.cancel'), style: 'cancel' },
      { text: t('editor.swap.confirm'), onPress: apply },
    ]);
  };

  const toggleLimitation = (joint: Limitation) =>
    setFilter((current) => ({
      ...current,
      limitations: current.limitations.includes(joint)
        ? current.limitations.filter((value) => value !== joint)
        : [...current.limitations, joint],
    }));

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t(replacing ? 'editor.picker.swapTitle' : 'editor.picker.title')}
        </Text>
        <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
          {t('creator.inputs.equipment.label')}
        </Text>
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}
        >
          {EQUIPMENT.map((equipment) => (
            <Chip
              key={equipment}
              label={t(EQUIPMENT_LABELS[equipment])}
              selected={filter.equipment === equipment}
              onPress={() => setFilter((current) => ({ ...current, equipment }))}
            />
          ))}
        </View>
        <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
          {t('creator.inputs.limitations.label')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {LIMITATIONS.map((joint) => (
            <Chip
              key={joint}
              label={t(LIMITATION_LABELS[joint])}
              selected={filter.limitations.includes(joint)}
              onPress={() => toggleLimitation(joint)}
            />
          ))}
        </View>

        {options.length === 0 ? (
          <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
            {t('editor.picker.empty')}
          </Text>
        ) : null}
        {options.map((option, index) => (
          <Card
            key={option.exercise.id}
            onPress={() => choose(index)}
            accessibilityLabel={t(replacing ? 'editor.picker.swap' : 'editor.picker.add', {
              name: option.name,
            })}
          >
            <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>{option.name}</Text>
          </Card>
        ))}
        <Button label={t('editor.back')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

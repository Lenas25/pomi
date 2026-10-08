import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, PencilSimple, Trash } from 'phosphor-react-native';

import {
  CUSTOM_STEP_KINDS,
  newCustomStep,
  stepRemovalImpact,
  type CustomStepKind,
  type Step,
} from '../domain/editor';
import { useT } from '../i18n';
import type { TranslationKey } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';

import { useEditorStore } from './editorStore';
import { IconAction } from './IconAction';
import { stepSummary } from './text';

const KIND_LABELS = {
  check: 'editor.routine.kind.check',
  wait: 'editor.routine.kind.wait',
  timed: 'editor.routine.kind.timed',
} as const satisfies Record<CustomStepKind, TranslationKey>;

/** One routine: rename it, reorder / edit / delete its steps and add new ones. */
export function RoutineEditorScreen() {
  const t = useT();
  const theme = useTheme();
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  const source = useEditorStore((store) => store.source);
  const state = useEditorStore((store) => store.state);
  const dispatch = useEditorStore((store) => store.dispatch);
  const [customName, setCustomName] = useState('');
  const [customKind, setCustomKind] = useState<CustomStepKind>('check');

  const routine = state?.program.routines.find((candidate) => candidate.id === routineId);
  if (!state || !source || !routine) {
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

  const confirmDelete = (step: Step) => {
    const impact = stepRemovalImpact(
      state.program,
      routine.id,
      step.id,
      source.context.loggedStepIds,
    );
    let body = t(impact.hasHistory ? 'editor.deleteStep.withHistory' : 'editor.deleteStep.plain', {
      name: step.name,
    });
    if (impact.hasHistory) {
      body +=
        ' ' +
        (impact.stillIn.length > 0
          ? t('editor.deleteStep.stillIn', { routines: impact.stillIn.join(', ') })
          : t('editor.deleteStep.historyLost'));
    }
    Alert.alert(t('editor.deleteStep.title'), body, [
      { text: t('editor.deleteStep.cancel'), style: 'cancel' },
      {
        text: t('editor.deleteStep.confirm'),
        style: 'destructive',
        onPress: () => dispatch({ type: 'removeStep', routineId: routine.id, stepId: step.id }),
      },
    ]);
  };

  const addCustom = () => {
    const step = newCustomStep(customKind, customName, state.program, source.context.loggedStepIds);
    dispatch({ type: 'addStep', routineId: routine.id, step });
    setCustomName('');
    router.push({ pathname: '/editar-paso', params: { routineId: routine.id, stepId: step.id } });
  };

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[4], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {routine.name}
        </Text>
        <TextField
          label={t('editor.routine.name')}
          value={routine.name}
          onChangeText={(name) => dispatch({ type: 'renameRoutine', routineId: routine.id, name })}
        />

        <Text
          accessibilityRole="header"
          style={[theme.text('title-md'), { color: theme.color.text }]}
        >
          {t('editor.routine.stepsTitle')}
        </Text>
        {routine.steps.length === 0 ? (
          <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
            {t('editor.routine.empty')}
          </Text>
        ) : null}
        {routine.steps.map((step, index) => (
          <Card key={step.id}>
            <View style={{ gap: theme.space[1] }}>
              <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>{step.name}</Text>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {stepSummary(step, t)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }}>
                <IconAction
                  icon={ArrowUp}
                  label={t('editor.moveUp', { name: step.name })}
                  disabled={index === 0}
                  onPress={() =>
                    dispatch({
                      type: 'moveStep',
                      routineId: routine.id,
                      stepId: step.id,
                      direction: -1,
                    })
                  }
                />
                <IconAction
                  icon={ArrowDown}
                  label={t('editor.moveDown', { name: step.name })}
                  disabled={index === routine.steps.length - 1}
                  onPress={() =>
                    dispatch({
                      type: 'moveStep',
                      routineId: routine.id,
                      stepId: step.id,
                      direction: 1,
                    })
                  }
                />
                <IconAction
                  icon={PencilSimple}
                  label={t('editor.edit', { name: step.name })}
                  onPress={() =>
                    router.push({
                      pathname: '/editar-paso',
                      params: { routineId: routine.id, stepId: step.id },
                    })
                  }
                />
                <IconAction
                  icon={Trash}
                  danger
                  label={t('editor.remove', { name: step.name })}
                  onPress={() => confirmDelete(step)}
                />
              </View>
            </View>
          </Card>
        ))}

        <Button
          label={t('editor.routine.addExercise')}
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/anadir-ejercicio', params: { routineId: routine.id } })
          }
        />

        <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
          {t('editor.routine.addCustom')}
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('editor.routine.customKind')}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}
        >
          {CUSTOM_STEP_KINDS.map((kind) => (
            <Chip
              key={kind}
              label={t(KIND_LABELS[kind])}
              selected={customKind === kind}
              onPress={() => setCustomKind(kind)}
            />
          ))}
        </View>
        <TextField
          label={t('editor.routine.customName')}
          value={customName}
          onChangeText={setCustomName}
        />
        <Button
          label={t('editor.routine.addCustom')}
          variant="secondary"
          disabled={customName.trim() === ''}
          onPress={addCustom}
        />
        <Button label={t('editor.back')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

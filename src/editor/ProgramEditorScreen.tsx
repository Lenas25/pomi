import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowDown, ArrowUp, Trash } from 'phosphor-react-native';

import { shareJsonFile } from '../backup/files';
import { getDatabase, getRepositories } from '../db';
import { routineRemovalLosses, validateProgram } from '../domain/editor';
import { useT } from '../i18n';
import { describeImportError } from '../templates/describeError';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';

import { exportText, loadEditorSource, prepareSave, saveEdited } from './editorSource';
import { selectDirty, useEditorStore } from './editorStore';
import { IconAction } from './IconAction';
import { errorText } from './text';
import { useEditorSource } from './useEditorSource';

type Notice = { tone: 'success' | 'error'; text: string };

/** Gym > Editar programa: routines (reorder, rename in the routine, add, remove), save and export. */
export function ProgramEditorScreen() {
  const t = useT();
  const theme = useTheme();
  const { status, reload } = useEditorSource();
  const source = useEditorStore((store) => store.source);
  const state = useEditorStore((store) => store.state);
  const dirty = useEditorStore(selectDirty);
  const dispatch = useEditorStore((store) => store.dispatch);
  const open = useEditorStore((store) => store.open);
  const close = useEditorStore((store) => store.close);
  const [newRoutine, setNewRoutine] = useState('');
  const [busy, setBusy] = useState<'save' | 'export' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const problems = useMemo(() => {
    if (!state) return [];
    return validateProgram(state.program).map((issue) => {
      const routine = state.program.routines.find((r) => r.id === issue.routineId);
      const step = routine?.steps.find((s) => s.id === issue.stepId);
      return t('editor.problem', {
        where: [routine?.name, step?.name].filter(Boolean).join(' › ') || t('editor.program'),
        message: errorText(issue.code, t),
      });
    });
  }, [state, t]);

  if (status === 'loading') return <Screen>{null}</Screen>;
  if (status === 'error') {
    return (
      <Screen>
        <EmptyState
          title={t('editor.loadError')}
          body={t('database.errorBody')}
          action={{ label: t('gym.tab.retry'), onPress: reload }}
        />
      </Screen>
    );
  }
  if (status === 'empty' || !state || !source) {
    return (
      <Screen>
        <EmptyState title={t('editor.emptyTitle')} body={t('editor.emptyBody')} />
      </Screen>
    );
  }

  const { program } = state;
  const leave = () => {
    const exit = () => {
      close();
      router.back();
    };
    if (!dirty) return exit();
    Alert.alert(t('editor.leave.title'), t('editor.leave.body'), [
      { text: t('editor.leave.stay'), style: 'cancel' },
      { text: t('editor.leave.confirm'), style: 'destructive', onPress: exit },
    ]);
  };

  const confirmRemove = (routineId: string, name: string) => {
    const losses = routineRemovalLosses(program, routineId, source.context.loggedStepIds);
    const body =
      t('editor.removeRoutine.body', { name }) +
      (losses.length > 0
        ? ` ${t('editor.removeRoutine.withHistory', { names: losses.map((l) => l.name).join(', ') })}`
        : '');
    Alert.alert(t('editor.removeRoutine.title'), body, [
      { text: t('editor.removeRoutine.cancel'), style: 'cancel' },
      {
        text: t('editor.removeRoutine.confirm'),
        style: 'destructive',
        onPress: () => dispatch({ type: 'removeRoutine', routineId }),
      },
    ]);
  };

  const persist = async (items: Parameters<typeof saveEdited>[2]) => {
    setBusy('save');
    try {
      await saveEdited(getDatabase(), getRepositories(), items);
      const fresh = await loadEditorSource(getRepositories());
      if (fresh) open(fresh);
      setNotice({ tone: 'success', text: t('editor.saved') });
    } catch (error) {
      if (__DEV__) console.error('Could not save the edited program', error);
      setNotice({ tone: 'error', text: t('editor.saveFailed') });
    } finally {
      setBusy(null);
    }
  };

  const save = () => {
    setNotice(null);
    const prepared = prepareSave(source, program);
    if (!prepared.ok) {
      const first = prepared.importErrors[0];
      setNotice({
        tone: 'error',
        text: first ? describeImportError(first, t) : t('editor.problemsTitle'),
      });
      return;
    }
    const lost = prepared.impact.losingHistory;
    if (lost.length === 0) {
      void persist(prepared.items);
      return;
    }
    Alert.alert(
      t('editor.saveImpact.title'),
      t('editor.saveImpact.body', { names: lost.map((entry) => entry.name).join(', ') }),
      [
        { text: t('editor.removeRoutine.cancel'), style: 'cancel' },
        { text: t('editor.saveImpact.confirm'), onPress: () => void persist(prepared.items) },
      ],
    );
  };

  const exportProgram = async () => {
    setNotice(null);
    const text = exportText(source, program);
    if (text === null || problems.length > 0) {
      setNotice({ tone: 'error', text: t('editor.exportInvalid') });
      return;
    }
    setBusy('export');
    try {
      const outcome = await shareJsonFile(
        `pomi-programa-${program.id}.json`,
        text,
        t('editor.exportDialog'),
        { sweep: false },
      );
      if (outcome === 'unavailable') {
        setNotice({ tone: 'error', text: t('editor.exportUnavailable') });
      }
    } catch {
      setNotice({ tone: 'error', text: t('editor.exportFailed') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[4], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('editor.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('editor.intro')}
        </Text>
        <TextField
          label={t('editor.programName')}
          value={program.name}
          onChangeText={(name) => dispatch({ type: 'renameProgram', name })}
        />

        <Text
          accessibilityRole="header"
          style={[theme.text('title-md'), { color: theme.color.text }]}
        >
          {t('editor.routinesTitle')}
        </Text>
        {program.routines.map((routine, index) => (
          <Card key={routine.id}>
            <View style={{ gap: theme.space[2] }}>
              <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
                {routine.name}
              </Text>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('editor.stepsCount', { count: routine.steps.length })}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }}>
                <IconAction
                  icon={ArrowUp}
                  label={t('editor.moveUp', { name: routine.name })}
                  disabled={index === 0}
                  onPress={() =>
                    dispatch({ type: 'moveRoutine', routineId: routine.id, direction: -1 })
                  }
                />
                <IconAction
                  icon={ArrowDown}
                  label={t('editor.moveDown', { name: routine.name })}
                  disabled={index === program.routines.length - 1}
                  onPress={() =>
                    dispatch({ type: 'moveRoutine', routineId: routine.id, direction: 1 })
                  }
                />
                <IconAction
                  icon={Trash}
                  danger
                  label={t('editor.remove', { name: routine.name })}
                  disabled={program.routines.length <= 1}
                  onPress={() => confirmRemove(routine.id, routine.name)}
                />
                <View style={{ flex: 1 }} />
                <Button
                  label={t('editor.editSteps')}
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/editar-rutina', params: { routineId: routine.id } })
                  }
                />
              </View>
            </View>
          </Card>
        ))}

        <TextField label={t('editor.newRoutine')} value={newRoutine} onChangeText={setNewRoutine} />
        <Button
          label={t('editor.addRoutine')}
          variant="secondary"
          disabled={newRoutine.trim() === ''}
          onPress={() => {
            dispatch({ type: 'addRoutine', name: newRoutine.trim() });
            setNewRoutine('');
          }}
        />

        {problems.length > 0 ? (
          <Card>
            <View accessibilityLiveRegion="polite" style={{ gap: theme.space[2] }}>
              <Text style={[theme.text('title-sm'), { color: theme.color.error }]}>
                {t('editor.problemsTitle')}
              </Text>
              {problems.map((problem, index) => (
                <Text key={index} style={[theme.text('body'), { color: theme.color.text }]}>
                  {problem}
                </Text>
              ))}
            </View>
          </Card>
        ) : null}
        {notice ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              theme.text('body'),
              { color: notice.tone === 'error' ? theme.color.error : theme.color.text },
            ]}
          >
            {notice.text}
          </Text>
        ) : null}

        <Button
          label={t('editor.save')}
          size="lg"
          onPress={save}
          loading={busy === 'save'}
          disabled={!dirty || busy !== null}
        />
        <Button
          label={t('editor.export')}
          variant="secondary"
          onPress={() => void exportProgram()}
          loading={busy === 'export'}
          disabled={busy !== null}
        />
        <Button label={t('editor.back')} variant="ghost" onPress={leave} />
      </View>
    </Screen>
  );
}

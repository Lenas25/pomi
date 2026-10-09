import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { ArrowDown, ArrowUp, Trash } from 'phosphor-react-native';

import { shareJsonFile } from '../backup/files';
import { getDatabase, getRepositories } from '../db';
import { routineRemovalLosses, validateProgram } from '../domain/editor';
import { useLocaleStore, useT, type Translate } from '../i18n';
import { describeImportError } from '../templates/describeError';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';

import {
  exportText,
  importErrorLocation,
  isSourceStale,
  loadEditorSource,
  prepareSave,
  saveEdited,
} from './editorSource';
import { selectDirty, useEditorStore } from './editorStore';
import { historyImpact, stepIdsOf } from '../generator/accept';
import { confirmAccept } from '../generator/confirmAccept';
import { IconAction } from './IconAction';
import { errorText } from './text';
import { useEditorSource } from './useEditorSource';
import { useTemplateText } from '../i18n/templateText';
import { editableText, withLocalizedText } from '../templates/localized';

type Notice = { tone: 'success' | 'error'; text: string };

/** The one "unsaved changes" alert: the Volver button, hardware back and the swipe all use it. */
function confirmDiscard(t: Translate, onConfirm: () => void): void {
  Alert.alert(t('editor.leave.title'), t('editor.leave.body'), [
    { text: t('editor.leave.stay'), style: 'cancel' },
    { text: t('editor.leave.confirm'), style: 'destructive', onPress: onConfirm },
  ]);
}

/** Gym > Editar programa: routines (reorder, rename in the routine, add, remove), save and export. */
export function ProgramEditorScreen() {
  const t = useT();
  const text = useTemplateText();
  const language = useLocaleStore((state) => state.language);
  const theme = useTheme();
  const { status, reload } = useEditorSource();
  const source = useEditorStore((store) => store.source);
  const state = useEditorStore((store) => store.state);
  const dirty = useEditorStore(selectDirty);
  const dispatch = useEditorStore((store) => store.dispatch);
  const open = useEditorStore((store) => store.open);
  const [newRoutine, setNewRoutine] = useState('');
  const [busy, setBusy] = useState<'save' | 'export' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const navigation = useNavigation();
  const tRef = useRef(t);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    tRef.current = t;
    dirtyRef.current = dirty;
  });
  const discarded = useRef(false);

  // Hardware back and the swipe go through the same alert as the "Volver" button.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (discarded.current || !dirtyRef.current) return;
        event.preventDefault();
        confirmDiscard(tRef.current, () => {
          discarded.current = true;
          navigation.dispatch(event.data.action);
        });
      }),
    [navigation],
  );
  // Leaving the editor for good (clean, or after discarding) forgets the in-memory edit; a dirty
  // unmount that was not confirmed (e.g. a tab switch) keeps it so the person can resume.
  useEffect(
    () => () => {
      if (discarded.current || !selectDirty(useEditorStore.getState())) {
        useEditorStore.getState().close();
      }
    },
    [],
  );

  const problems = useMemo(() => {
    if (!state) return [];
    return validateProgram(state.program).map((issue) => {
      const routine = state.program.routines.find((r) => r.id === issue.routineId);
      const step = routine?.steps.find((s) => s.id === issue.stepId);
      return t('editor.problem', {
        where:
          [text(routine?.name), text(step?.name)].filter(Boolean).join(' › ') ||
          t('editor.program'),
        message: errorText(issue.code, t),
      });
    });
  }, [state, t, text]);

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
  // The beforeRemove guard shows the alert when there are unsaved changes.
  const leave = () => router.back();

  const confirmRemove = (routineId: string, name: string) => {
    const losses = routineRemovalLosses(program, routineId, source.context.loggedStepIds);
    const body =
      t('editor.removeRoutine.body', { name }) +
      (losses.length > 0
        ? ` ${t('editor.removeRoutine.withHistory', { names: losses.map((l) => text(l.name)).join(', ') })}`
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

  const reloadFromStore = async () => {
    const fresh = await loadEditorSource(getRepositories());
    if (fresh) open(fresh);
    setNotice(null);
  };

  /** Draft ("Ajustar" in the routine creator): validate, confirm the history impact, store it. */
  const applyDraft = async () => {
    setNotice(null);
    const prepared = prepareSave(source, program);
    if (!prepared.ok) {
      const lines = prepared.importErrors.map((error) => describeImportError(error, t));
      setNotice({
        tone: 'error',
        text: lines.length > 0 ? lines.join('\n') : t('editor.problemsTitle'),
      });
      return;
    }
    const impact = historyImpact(source.context, stepIdsOf(prepared.items));
    if (!(await confirmAccept(t, impact))) return;
    setBusy('save');
    try {
      await saveEdited(getDatabase(), getRepositories(), prepared.items);
      discarded.current = true;
      useEditorStore.getState().close();
      router.dismissTo('/(tabs)/gym');
    } catch (error) {
      if (__DEV__) console.error('Could not save the adjusted routine', error);
      setNotice({ tone: 'error', text: t('editor.saveFailed') });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (source.draft) {
      await applyDraft();
      return;
    }
    setNotice(null);
    setBusy('save');
    try {
      if (await isSourceStale(getRepositories(), source)) {
        Alert.alert(t('editor.stale.title'), t('editor.stale.body'), [
          { text: t('editor.stale.stay'), style: 'cancel' },
          {
            text: t('editor.stale.reload'),
            style: 'destructive',
            onPress: () => void reloadFromStore().catch(() => undefined),
          },
        ]);
        setNotice({ tone: 'error', text: t('editor.stale.notice') });
        return;
      }
    } catch {
      setNotice({ tone: 'error', text: t('editor.saveFailed') });
      return;
    } finally {
      setBusy(null);
    }
    const prepared = prepareSave(source, program);
    if (!prepared.ok) {
      const lines = prepared.importErrors.map((error) => {
        const where = importErrorLocation(error.path, program);
        const message = describeImportError(error, t);
        return where ? t('editor.problem', { where, message }) : message;
      });
      setNotice({
        tone: 'error',
        text: lines.length > 0 ? lines.join('\n') : t('editor.problemsTitle'),
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
          {t(source.draft ? 'editor.draftTitle' : 'editor.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t(source.draft ? 'editor.draftIntro' : 'editor.intro')}
        </Text>
        <TextField
          label={t('editor.programName')}
          value={editableText(program.name, language)}
          onChangeText={(name) =>
            dispatch({
              type: 'renameProgram',
              name: withLocalizedText(program.name, language, name),
            })
          }
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
                {text(routine.name)}
              </Text>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('editor.stepsCount', { count: routine.steps.length })}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }}>
                <IconAction
                  icon={ArrowUp}
                  label={t('editor.moveUp', { name: text(routine.name) })}
                  disabled={index === 0}
                  onPress={() =>
                    dispatch({ type: 'moveRoutine', routineId: routine.id, direction: -1 })
                  }
                />
                <IconAction
                  icon={ArrowDown}
                  label={t('editor.moveDown', { name: text(routine.name) })}
                  disabled={index === program.routines.length - 1}
                  onPress={() =>
                    dispatch({ type: 'moveRoutine', routineId: routine.id, direction: 1 })
                  }
                />
                <IconAction
                  icon={Trash}
                  danger
                  label={t('editor.remove', { name: text(routine.name) })}
                  disabled={program.routines.length <= 1}
                  onPress={() => confirmRemove(routine.id, text(routine.name))}
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
          label={t(source.draft ? 'creator.preview.accept' : 'editor.save')}
          size="lg"
          onPress={() => void save()}
          loading={busy === 'save'}
          disabled={(!dirty && !source.draft) || busy !== null}
        />
        {source.draft ? null : (
          <Button
            label={t('editor.export')}
            variant="secondary"
            onPress={() => void exportProgram()}
            loading={busy === 'export'}
            disabled={busy !== null}
          />
        )}
        <Button
          label={t(source.draft ? 'editor.draftBack' : 'editor.back')}
          variant="ghost"
          onPress={leave}
        />
      </View>
    </Screen>
  );
}

import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { pickTextFile } from '../backup/files';
import { FileTooLargeError, MAX_PROGRAM_BYTES, toMegabytes } from '../backup/limits';
import { getDatabase, getRepositories } from '../db';
import { useT } from '../i18n';
import { requestNotificationSync } from '../notifications/sync';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { OptionRow } from '../ui/OptionRow';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/theme';

import { describeImportError } from './describeError';
import {
  applyProgramImport,
  computeImportImpact,
  previewProgramImport,
  type ImportContext,
  type ImportMode,
  type ProgramImportError,
  type ProgramPreviewItem,
} from './programImport';

type Notice = { tone: 'success' | 'error'; text: string };

/** Ajustes > Importar programa de gym: pick a JSON file, preview it, then replace or add. */
export function ProgramImportScreen() {
  const t = useT();
  const theme = useTheme();
  const [busy, setBusy] = useState<'pick' | 'apply' | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [items, setItems] = useState<ProgramPreviewItem[] | null>(null);
  const [context, setContext] = useState<ImportContext | null>(null);
  const [mode, setMode] = useState<ImportMode>('replace');
  const [notice, setNotice] = useState<Notice | null>(null);

  const describe = useCallback(
    (error: ProgramImportError) =>
      error.kind === 'noProgram' ? t('programImport.noProgram') : describeImportError(error.error, t),
    [t],
  );

  const pick = useCallback(async () => {
    setBusy('pick');
    setNotice(null);
    setProblems([]);
    setItems(null);
    setContext(null);
    try {
      const text = await pickTextFile(MAX_PROGRAM_BYTES);
      if (text === null) return;
      const repositories = getRepositories();
      const modules = await repositories.templates.listModules();
      const loggedStepIds = new Set(await repositories.workouts.loggedStepIds());
      const preview = previewProgramImport(text, new Set(modules.map((m) => m.id)));
      if (preview.ok) {
        setContext({ modules, loggedStepIds });
        setItems(preview.items);
      } else setProblems(preview.errors.map(describe));
    } catch (error) {
      if (error instanceof FileTooLargeError) {
        setNotice({
          tone: 'error',
          text: t('programImport.tooLarge', { mb: toMegabytes(error.maxBytes) }),
        });
        return;
      }
      if (__DEV__) console.error('Could not read the program file', error);
      setNotice({ tone: 'error', text: t('programImport.readFailed') });
    } finally {
      setBusy(null);
    }
  }, [describe, t]);

  const apply = useCallback(
    async (preview: ProgramPreviewItem[]) => {
      setBusy('apply');
      try {
        const result = await applyProgramImport(getDatabase(), getRepositories(), preview, mode);
        void requestNotificationSync('dataChanged');
        setItems(null);
        setNotice({
          tone: 'success',
          text:
            result.skipped.length > 0
              ? `${t('programImport.done')} ${t('programImport.skipped', { ids: result.skipped.join(', ') })}`
              : t('programImport.done'),
        });
      } catch (error) {
        if (__DEV__) console.error('Could not import the program', error);
        setNotice({ tone: 'error', text: t('programImport.failed') });
      } finally {
        setBusy(null);
      }
    },
    [mode, t],
  );

  const impact = useMemo(
    () => (items && context ? computeImportImpact(items, mode, context) : null),
    [items, context, mode],
  );

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('programImport.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('programImport.intro')}
        </Text>
        <Button
          label={t('programImport.pick')}
          onPress={() => void pick()}
          loading={busy === 'pick'}
          disabled={busy !== null}
        />

        {problems.length > 0 ? (
          <Card>
            <View accessibilityLiveRegion="polite" style={{ gap: theme.space[2] }}>
              <Text style={[theme.text('title-sm'), { color: theme.color.error }]}>
                {t('programImport.errorsTitle')}
              </Text>
              {problems.map((problem, index) => (
                <Text key={index} style={[theme.text('body'), { color: theme.color.text }]}>
                  {problem}
                </Text>
              ))}
            </View>
          </Card>
        ) : null}

        {items ? (
          <Card>
            <View style={{ gap: theme.space[3] }}>
              <Text
                accessibilityRole="header"
                style={[theme.text('title-sm'), { color: theme.color.text }]}
              >
                {t('programImport.previewTitle')}
              </Text>
              {items.map((item) => (
                <View key={item.module.id}>
                  <Text style={[theme.text('body'), { color: theme.color.text }]}>
                    {t('programImport.item', {
                      name: item.module.name,
                      programs: item.programs,
                      routines: item.routines,
                    })}
                  </Text>
                  <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                    {item.exists ? t('programImport.exists') : t('programImport.isNew')}
                  </Text>
                </View>
              ))}
              <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
                {t('programImport.modeTitle')}
              </Text>
              <View accessibilityRole="radiogroup" style={{ gap: theme.space[2] }}>
                <OptionRow
                  label={t('programImport.replace')}
                  selected={mode === 'replace'}
                  onPress={() => setMode('replace')}
                />
                <OptionRow
                  label={t('programImport.add')}
                  selected={mode === 'add'}
                  onPress={() => setMode('add')}
                />
              </View>
              {impact && impact.losingHistory.length > 0 ? (
                <Text style={[theme.text('body'), { color: theme.color.text }]}>
                  {t('programImport.losingHistory', {
                    names: impact.losingHistory.map((step) => step.name).join(', '),
                  })}
                </Text>
              ) : null}
              {impact && impact.deactivated.length > 0 ? (
                <Text style={[theme.text('body'), { color: theme.color.text }]}>
                  {t('programImport.deactivated', {
                    names: impact.deactivated.map((module) => module.name).join(', '),
                  })}
                </Text>
              ) : null}
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('programImport.note')}
              </Text>
              <Button
                label={t('programImport.apply')}
                onPress={() => void apply(items)}
                loading={busy === 'apply'}
                disabled={busy !== null}
              />
            </View>
          </Card>
        ) : null}

        {notice ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              theme.text('body'),
              { color: notice.tone === 'success' ? theme.color.success : theme.color.error },
            ]}
          >
            {notice.text}
          </Text>
        ) : null}

        <Button label={t('settings.back')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

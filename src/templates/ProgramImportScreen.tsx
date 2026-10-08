import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { pickTextFile } from '../backup/files';
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
  previewProgramImport,
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
    try {
      const text = await pickTextFile();
      if (text === null) return;
      const existing = new Set((await getRepositories().templates.listModules()).map((m) => m.id));
      const preview = previewProgramImport(text, existing);
      if (preview.ok) setItems(preview.items);
      else setProblems(preview.errors.map(describe));
    } catch (error) {
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

import { useCallback, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { format, parseISO } from 'date-fns';

import { getDatabase, getRepositories } from '../db';
import { hydrateStores } from '../db/useDatabaseReady';
import { useT } from '../i18n';
import type { TranslationKey } from '../i18n/types';
import { requestNotificationSync } from '../notifications/sync';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/theme';

import { createBackup, restoreBackup, summarizeBackup, type BackupSummary } from './backup';
import { describeBackupError } from './describeError';
import { pickTextFile, shareJsonFile } from './files';
import { parseBackupText } from './parse';
import type { Backup } from './schema';

type Notice = { tone: 'success' | 'error'; text: string };

const COUNT_KEYS = [
  'templates',
  'workouts',
  'sets',
  'habitLogs',
  'checkins',
  'stepDays',
  'activityLogs',
  'metricEntries',
  'foodNotes',
  'photos',
] as const satisfies readonly (keyof BackupSummary['counts'])[];

function backupFileName(now: Date): string {
  return `pomi-backup-${format(now, 'yyyy-MM-dd-HHmm')}.json`;
}

/** Ajustes > Respaldo: export everything to a JSON file, or replace everything from one. */
export function BackupScreen() {
  const t = useT();
  const theme = useTheme();
  const [includePhotos, setIncludePhotos] = useState(false);
  const [busy, setBusy] = useState<'export' | 'pick' | 'restore' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState<Backup | null>(null);

  const exportBackup = useCallback(async () => {
    setBusy('export');
    setNotice(null);
    try {
      const appVersion = Constants.expoConfig?.version ?? '0.0.0';
      const backup = await createBackup(getDatabase(), { appVersion, includePhotos });
      const outcome = await shareJsonFile(
        backupFileName(new Date()),
        JSON.stringify(backup),
        t('backup.export.shareTitle'),
      );
      setNotice(
        outcome === 'shared'
          ? { tone: 'success', text: t('backup.export.done') }
          : { tone: 'error', text: t('backup.export.unavailable') },
      );
    } catch (error) {
      if (__DEV__) console.error('Could not create the backup', error);
      setNotice({ tone: 'error', text: t('backup.export.failed') });
    } finally {
      setBusy(null);
    }
  }, [includePhotos, t]);

  const pickBackup = useCallback(async () => {
    setBusy('pick');
    setNotice(null);
    setProblems([]);
    setPending(null);
    try {
      const text = await pickTextFile();
      if (text === null) return;
      const result = parseBackupText(text);
      if (result.ok) setPending(result.backup);
      else setProblems(result.errors.map((error) => describeBackupError(error, t)));
    } catch (error) {
      if (__DEV__) console.error('Could not read the file', error);
      setNotice({ tone: 'error', text: t('backup.import.readFailed') });
    } finally {
      setBusy(null);
    }
  }, [t]);

  const restore = useCallback(
    async (backup: Backup) => {
      setBusy('restore');
      try {
        await restoreBackup(getDatabase(), backup);
        const repositories = getRepositories();
        await hydrateStores(repositories);
        // The plan of reminders came from the old data.
        void requestNotificationSync('dataChanged');
        setPending(null);
        setNotice({ tone: 'success', text: t('backup.import.restored') });
      } catch (error) {
        if (__DEV__) console.error('Could not restore the backup', error);
        setNotice({ tone: 'error', text: t('backup.import.restoreFailed') });
      } finally {
        setBusy(null);
      }
    },
    [t],
  );

  const confirmReplace = useCallback(
    (backup: Backup) => {
      Alert.alert(t('backup.import.confirmTitle'), t('backup.import.confirmBody'), [
        { text: t('backup.import.cancel'), style: 'cancel' },
        {
          text: t('backup.import.confirm'),
          style: 'destructive',
          onPress: () => void restore(backup),
        },
      ]);
    },
    [restore, t],
  );

  const summary = pending ? summarizeBackup(pending) : null;
  const muted = [theme.text('caption'), { color: theme.color.textMuted }];

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('backup.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('backup.intro')}
        </Text>

        <Card>
          <View style={{ gap: theme.space[3] }}>
            <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
              {t('backup.export.title')}
            </Text>
            <Text style={muted}>{t('backup.export.body')}</Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: theme.space[3],
                minHeight: theme.touch.min,
              }}
            >
              <Text style={[theme.text('body'), { flex: 1, color: theme.color.text }]}>
                {t('backup.export.photos')}
              </Text>
              <Switch
                accessibilityLabel={t('backup.export.photos')}
                value={includePhotos}
                onValueChange={setIncludePhotos}
                trackColor={{ true: theme.color.brand, false: theme.color.border }}
                thumbColor={theme.color.surface}
              />
            </View>
            <Text style={muted}>{t('backup.export.photosHint')}</Text>
            <Button
              label={t('backup.export.action')}
              onPress={() => void exportBackup()}
              loading={busy === 'export'}
              disabled={busy !== null}
            />
          </View>
        </Card>

        <Card>
          <View style={{ gap: theme.space[3] }}>
            <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
              {t('backup.import.title')}
            </Text>
            <Text style={muted}>{t('backup.import.body')}</Text>
            <Button
              label={t('backup.import.pick')}
              variant="secondary"
              onPress={() => void pickBackup()}
              loading={busy === 'pick'}
              disabled={busy !== null}
            />

            {problems.length > 0 ? (
              <View accessibilityLiveRegion="polite" style={{ gap: theme.space[2] }}>
                <Text style={[theme.text('title-sm'), { color: theme.color.error }]}>
                  {t('backup.import.errorsTitle')}
                </Text>
                {problems.map((problem, index) => (
                  <Text key={index} style={[theme.text('body'), { color: theme.color.text }]}>
                    {problem}
                  </Text>
                ))}
              </View>
            ) : null}

            {pending && summary ? (
              <View style={{ gap: theme.space[2] }}>
                <Text
                  accessibilityRole="header"
                  style={[theme.text('title-sm'), { color: theme.color.text }]}
                >
                  {t('backup.import.previewTitle')}
                </Text>
                <Text style={muted}>
                  {t('backup.import.created', {
                    date: format(parseISO(summary.exportedAt), 'yyyy-MM-dd HH:mm'),
                    version: summary.appVersion,
                  })}
                </Text>
                {COUNT_KEYS.filter((key) => key !== 'photos' || summary.includesPhotos).map(
                  (key) => (
                    <Text key={key} style={[theme.text('body'), { color: theme.color.text }]}>
                      {t(`backup.counts.${key}` satisfies TranslationKey, {
                        count: summary.counts[key],
                      })}
                    </Text>
                  ),
                )}
                {summary.includesPhotos ? (
                  <Text style={muted}>{t('backup.import.withPhotos')}</Text>
                ) : null}
                <Button
                  label={t('backup.import.replaceAll')}
                  variant="danger"
                  onPress={() => confirmReplace(pending)}
                  loading={busy === 'restore'}
                  disabled={busy !== null}
                />
                <Button
                  label={t('backup.import.cancel')}
                  variant="ghost"
                  onPress={() => setPending(null)}
                  disabled={busy !== null}
                />
              </View>
            ) : null}
          </View>
        </Card>

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

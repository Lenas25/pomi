import { useCallback, useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { format, parseISO } from 'date-fns';

import { getDatabase, getRepositories } from '../db';
import { hydrateStores } from '../db/useDatabaseReady';
import { useT } from '../i18n';
import type { TranslationKey } from '../i18n/types';
import { refreshBackgroundSchedule } from '../notifications/backgroundTasks';
import { requestNotificationSync } from '../notifications/sync';
import { MAX_PHOTO_PART_BYTES } from '../photos/photoArchive';
import { exportPhotoArchive, importPhotoArchive } from '../photos/photoBackup';
import { expoPhotoFs } from '../photos/expoPhotoFs';
import { sweepOrphanPhotos, withPhotoLock } from '../photos/photoStore';
import { dayKeyFor } from '../domain/time';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { InfoButton } from '../ui/InfoButton';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/theme';

import {
  createBackup,
  restoreBackupExclusive,
  summarizeBackup,
  type BackupSummary,
} from './backup';
import { describeBackupError } from './describeError';
import { pickTextFile, shareJsonFile } from './files';
import { FileTooLargeError, MAX_BACKUP_BYTES, toMegabytes } from './limits';
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
  const [busy, setBusy] = useState<'export' | 'pick' | 'restore' | 'photos' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reminder, setReminder] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRepositories()
      .settings.get('backupReminder')
      .then((stored) => {
        if (!cancelled) setReminder(stored ?? true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const changeReminder = useCallback((value: boolean) => {
    setReminder(value);
    getRepositories()
      .settings.set('backupReminder', value)
      .catch(() => setReminder(!value));
  }, []);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState<Backup | null>(null);

  const exportBackup = useCallback(async () => {
    setBusy('export');
    setNotice(null);
    try {
      const appVersion = Constants.expoConfig?.version ?? '0.0.0';
      const backup = await createBackup(getDatabase(), {
        appVersion,
        includePhotos,
      });
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
      const text = await pickTextFile(MAX_BACKUP_BYTES);
      if (text === null) return;
      const result = parseBackupText(text);
      if (result.ok) setPending(result.backup);
      else setProblems(result.errors.map((error) => describeBackupError(error, t)));
    } catch (error) {
      if (error instanceof FileTooLargeError) {
        setNotice({
          tone: 'error',
          text: t('backup.import.tooLarge', { mb: toMegabytes(error.maxBytes) }),
        });
        return;
      }
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
        // Replacing photo rows is a photo operation: it waits for a save/delete/sweep in progress.
        const run = () => restoreBackupExclusive(getDatabase(), backup);
        await (backup.includesPhotos ? withPhotoLock(run) : run());
      } catch (error) {
        // Rolled back as a whole: the current data is untouched.
        if (__DEV__) console.error('Could not restore the backup', error);
        setNotice({ tone: 'error', text: t('backup.import.restoreFailed') });
        setBusy(null);
        return;
      }
      // From here on the data IS restored: a failure below must not say the opposite.
      setPending(null);
      try {
        const repositories = getRepositories();
        await hydrateStores(repositories);
        // Photo files are touched only when the backup replaced the photo rows; a backup without
        // photos leaves the photos (rows and files) alone.
        if (backup.includesPhotos) {
          await sweepOrphanPhotos(expoPhotoFs, repositories.photos).catch(() => 0);
        }
        // The nudge settings came from the backup: register the periodic job again.
        await refreshBackgroundSchedule({ force: true }).catch(() => undefined);
        // The plan of reminders came from the old data.
        void requestNotificationSync('dataChanged');
        setNotice({ tone: 'success', text: t('backup.import.restored') });
      } catch (error) {
        if (__DEV__) console.error('Restored, but could not reload the app state', error);
        setNotice({ tone: 'success', text: t('backup.import.restoredRestart') });
      } finally {
        setBusy(null);
      }
    },
    [t],
  );

  const exportPhotos = useCallback(async () => {
    setBusy('photos');
    setNotice(null);
    try {
      const result = await exportPhotoArchive({
        fs: expoPhotoFs,
        photos: getRepositories().photos,
        share: shareJsonFile,
        dialogTitle: t('backup.photos.shareTitle'),
        today: dayKeyFor(new Date()),
      });
      if (result.status === 'done') {
        setNotice({ tone: 'success', text: t('backup.photos.exported', { count: result.photos }) });
      } else {
        setNotice({
          tone: result.status === 'none' ? 'success' : 'error',
          text: t(result.status === 'none' ? 'backup.photos.none' : 'backup.export.unavailable'),
        });
      }
    } catch (error) {
      if (__DEV__) console.error('Could not export the photos', error);
      setNotice({ tone: 'error', text: t('backup.photos.exportFailed') });
    } finally {
      setBusy(null);
    }
  }, [t]);

  const importPhotos = useCallback(async () => {
    setBusy('photos');
    setNotice(null);
    try {
      // A photo part is small by design: a lower cap than a full backup.
      const text = await pickTextFile(MAX_PHOTO_PART_BYTES);
      if (text === null) return;
      const result = await importPhotoArchive({
        fs: expoPhotoFs,
        photos: getRepositories().photos,
        text,
      });
      if (result.status === 'restored') {
        setNotice({
          tone: result.failed > 0 ? 'error' : 'success',
          text: t(result.failed > 0 ? 'backup.photos.restoredPartial' : 'backup.photos.restored', {
            count: result.restored,
            failed: result.failed,
            part: result.part,
            parts: result.parts,
          }),
        });
      } else if (result.status === 'allFailed') {
        setNotice({ tone: 'error', text: t('backup.photos.allFailed') });
      } else if (result.status === 'noMatch') {
        setNotice({ tone: 'error', text: t('backup.photos.noMatch') });
      } else {
        setNotice({ tone: 'error', text: t('backup.photos.invalid') });
      }
    } catch (error) {
      if (error instanceof FileTooLargeError) {
        setNotice({
          tone: 'error',
          text: t('backup.import.tooLarge', { mb: toMegabytes(error.maxBytes) }),
        });
        return;
      }
      if (__DEV__) console.error('Could not restore the photos', error);
      setNotice({ tone: 'error', text: t('backup.import.readFailed') });
    } finally {
      setBusy(null);
    }
  }, [t]);

  const confirmReplace = useCallback(
    (backup: Backup) => {
      Alert.alert(
        t('backup.import.confirmTitle'),
        t(
          backup.includesPhotos
            ? 'backup.import.confirmBodyWithPhotos'
            : 'backup.import.confirmBody',
        ),
        [
          { text: t('backup.import.cancel'), style: 'cancel' },
          {
            text: t('backup.import.confirm'),
            style: 'destructive',
            onPress: () => void restore(backup),
          },
        ],
      );
    },
    [restore, t],
  );

  const summary = pending ? summarizeBackup(pending) : null;
  const muted = [theme.text('caption'), { color: theme.color.textMuted }];

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-lg'), { color: theme.color.text, flex: 1 }]}
          >
            {t('backup.title')}
          </Text>
          <InfoButton title={t('backup.title')} body={[t('backup.info'), t('backup.policy')]} />
        </View>
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
          <View style={{ gap: theme.space[2] }}>
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
                {t('backup.reminder.label')}
              </Text>
              <Switch
                accessibilityLabel={t('backup.reminder.label')}
                value={reminder}
                onValueChange={changeReminder}
                trackColor={{ true: theme.color.brand, false: theme.color.border }}
                thumbColor={theme.color.surface}
              />
            </View>
            <Text style={muted}>{t('backup.reminder.hint')}</Text>
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
                <Text style={muted}>
                  {summary.includesPhotos
                    ? t('backup.import.withPhotos')
                    : t('backup.import.photosKept')}
                </Text>
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

        <Card>
          <View style={{ gap: theme.space[3] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
              <Text style={[theme.text('title-sm'), { color: theme.color.text, flex: 1 }]}>
                {t('backup.photos.title')}
              </Text>
              <InfoButton title={t('backup.photos.title')} body={t('backup.photos.info')} />
            </View>
            <Text style={muted}>{t('backup.photos.body')}</Text>
            <Button
              label={t('backup.photos.export')}
              variant="secondary"
              onPress={() => void exportPhotos()}
              loading={busy === 'photos'}
              disabled={busy !== null}
            />
            <Button
              label={t('backup.photos.import')}
              variant="secondary"
              onPress={() => void importPhotos()}
              disabled={busy !== null}
            />
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

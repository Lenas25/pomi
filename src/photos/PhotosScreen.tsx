// "Tus fotos" (route `/fotos`, from Ajustes and Progreso): every stored photo, a page at a time,
// plus "delete all" (files and rows). The Progreso grid only shows the newest few.
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';

import { getRepositories } from '../db';
import type { PhotoRow } from '../db/repositories/photos';
import { useT } from '../i18n';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/theme';

import { expoPhotoFs } from './expoPhotoFs';
import { appendPage, cursorOf, withoutRows } from './photoPaging';
import { deleteAllPhotos, deletePhoto } from './photoStore';
import { StoredPhoto } from './StoredPhoto';

/** Photos per page: three columns, six rows. */
export const PHOTOS_PAGE_SIZE = 18;

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: PhotoRow[]; total: number };

const poseName = (pose: string) => pose.charAt(0).toUpperCase() + pose.slice(1);

async function readFirstPage(): Promise<State> {
  try {
    const { photos } = getRepositories();
    const [total, rows] = await Promise.all([photos.count(), photos.pageAfter(PHOTOS_PAGE_SIZE)]);
    return { status: 'ready', rows, total };
  } catch (error) {
    if (__DEV__) console.error('Could not load the photos', error);
    return { status: 'error' };
  }
}

export function PhotosScreen() {
  const t = useT();
  const theme = useTheme();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const loadFirstPage = useCallback(async () => {
    setState({ status: 'loading' });
    setState(await readFirstPage());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readFirstPage().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (state.status !== 'ready') return;
    setBusy(true);
    try {
      const { photos } = getRepositories();
      const next = await photos.pageAfter(PHOTOS_PAGE_SIZE, cursorOf(state.rows));
      const rows = appendPage(state.rows, next);
      // A short page means there is nothing after it: the stored count was stale (photos removed
      // elsewhere), so trust what was read and stop offering "load more".
      const total = next.length < PHOTOS_PAGE_SIZE ? rows.length : state.total;
      setState({ status: 'ready', rows, total });
    } catch (error) {
      if (__DEV__) console.error('Could not load more photos', error);
      setNotice({ tone: 'error', text: t('photosScreen.loadFailed') });
    } finally {
      setBusy(false);
    }
  }, [state, t]);

  const removeOne = useCallback(
    async (id: number) => {
      try {
        await deletePhoto(expoPhotoFs, getRepositories().photos, id);
        // Local removal: the list keeps its scroll position and loaded pages.
        setState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                rows: withoutRows(current.rows, [id]),
                total: Math.max(0, current.total - 1),
              }
            : current,
        );
      } catch (error) {
        if (__DEV__) console.error('Could not delete the photo', error);
        Alert.alert(t('progress.photos.deleteFailed'));
      }
    },
    [t],
  );

  const confirmOne = (id: number) =>
    Alert.alert(t('progress.photos.deleteTitle'), t('progress.photos.deleteBody'), [
      { text: t('progress.photos.cancel'), style: 'cancel' },
      {
        text: t('progress.photos.delete'),
        style: 'destructive',
        onPress: () => void removeOne(id),
      },
    ]);

  const removeAll = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await deleteAllPhotos(expoPhotoFs, getRepositories().photos);
      if (result.failed === 0) {
        setState({ status: 'ready', rows: [], total: 0 });
        setNotice({ tone: 'success', text: t('photosScreen.deleteAllDone') });
      } else {
        await loadFirstPage();
        setNotice({
          tone: 'error',
          text: t('photosScreen.deleteAllPartial', {
            deleted: result.deleted,
            failed: result.failed,
          }),
        });
      }
    } catch (error) {
      if (__DEV__) console.error('Could not delete all the photos', error);
      setNotice({ tone: 'error', text: t('photosScreen.deleteAllFailed') });
      await loadFirstPage();
    } finally {
      setBusy(false);
    }
  }, [loadFirstPage, t]);

  const confirmAll = (total: number) =>
    Alert.alert(
      t('photosScreen.deleteAllTitle'),
      t('photosScreen.deleteAllBody', { count: total }),
      [
        { text: t('progress.photos.cancel'), style: 'cancel' },
        {
          text: t('photosScreen.deleteAllConfirm'),
          style: 'destructive',
          onPress: () => void removeAll(),
        },
      ],
    );

  const rows = state.status === 'ready' ? state.rows : [];
  const total = state.status === 'ready' ? state.total : 0;

  const renderItem = ({ item: photo }: { item: PhotoRow }) => {
    const label = t('progress.photos.label', {
      pose: poseName(photo.pose),
      date: format(parseISO(photo.date), 'd/M/yyyy'),
    });
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('progress.photos.hint')}
        onPress={() => confirmOne(photo.id)}
        style={({ pressed }) => ({
          flexGrow: 1,
          flexBasis: 0,
          maxWidth: '32%',
          gap: theme.space[1],
          opacity: pressed ? theme.opacity.pressed : 1,
        })}
      >
        <StoredPhoto name={photo.uri} label={label} thumbnail />
        <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{label}</Text>
      </Pressable>
    );
  };

  const header = (
    <View style={{ gap: theme.space[3], paddingTop: theme.space[4] }}>
      <Text
        accessibilityRole="header"
        style={[theme.text('title-lg'), { color: theme.color.text }]}
      >
        {t('photosScreen.title')}
      </Text>

      {state.status === 'error' ? (
        <>
          <Text style={[theme.text('body'), { color: theme.color.error }]}>
            {t('photosScreen.loadFailed')}
          </Text>
          <Button label={t('photosScreen.retry')} onPress={() => void loadFirstPage()} />
        </>
      ) : null}

      {state.status === 'ready' && total === 0 ? (
        <EmptyState
          compact
          pose="mide"
          title={t('photosScreen.emptyTitle')}
          body={t('photosScreen.emptyBody')}
        />
      ) : null}

      {rows.length > 0 ? (
        <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
          {t('photosScreen.count', { count: total })}
        </Text>
      ) : null}
    </View>
  );

  const footer = (
    <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
      {rows.length > 0 ? (
        <>
          {rows.length < total ? (
            <Button
              label={t('photosScreen.loadMore')}
              variant="secondary"
              onPress={() => void loadMore()}
              loading={busy}
            />
          ) : null}
          <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
            {t('photosScreen.deleteAllHint')}
          </Text>
          <Button
            label={t('photosScreen.deleteAll')}
            variant="danger"
            onPress={() => confirmAll(total)}
            disabled={busy}
          />
        </>
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

      <Button label={t('photosScreen.back')} variant="ghost" onPress={() => router.back()} />
    </View>
  );

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <FlatList
        data={rows}
        keyExtractor={(photo) => String(photo.id)}
        renderItem={renderItem}
        numColumns={3}
        columnWrapperStyle={{ gap: theme.space[3], marginBottom: theme.space[3] }}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        initialNumToRender={PHOTOS_PAGE_SIZE}
        windowSize={5}
        maxToRenderPerBatch={9}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { format } from 'date-fns';

import { getRepositories } from '../db';
import { useLocaleStore, useT, t as translate } from '../i18n';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/theme';

import { loadReportData } from './loadReportData';
import { prepareReport } from './prepare';
import { readPhotoSources, sharePdf, shareText } from './shareReport';
import { ShareView } from './ShareView';
import type { ReportData, ReportFormat, ReportModel } from './types';

/** Route `/compartir`: loads the data once, then hands over to the form. */
export function ShareScreen() {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const [now, setNow] = useState(() => new Date());
  const [data, setData] = useState<ReportData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const at = new Date();
      setData(await loadReportData(getRepositories(), at));
      setNow(at);
      setFailed(false);
    } catch (error) {
      if (__DEV__) console.error('Could not load the report data', error);
      setFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onShare = useCallback(
    async (model: ReportModel, reportFormat: ReportFormat) => {
      const title = t('share.shareTitle');
      if (reportFormat === 'text') {
        const prepared = prepareReport(model, 'text', { t: translate, language });
        return prepared.format === 'text' ? shareText(prepared.message, title) : 'dismissed';
      }
      const photos = model.sections.find((section) => section.kind === 'photos');
      const photoSources = await readPhotoSources(
        photos?.kind === 'photos' ? photos.items.map((item) => item.name) : [],
      );
      const prepared = prepareReport(model, 'pdf', { t: translate, language, photoSources });
      return prepared.format === 'pdf'
        ? sharePdf(prepared.html, `pomi-report-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`, title)
        : 'dismissed';
    },
    [language, t],
  );

  if (failed) {
    return (
      <Screen>
        <EmptyState
          title={t('share.loadError')}
          body={t('share.loadErrorBody')}
          action={{ label: t('share.retry'), onPress: () => void load() }}
        />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <Text accessibilityRole="progressbar" style={{ color: theme.color.textMuted }}>
          {t('share.preparing')}
        </Text>
      </Screen>
    );
  }
  return <ShareView data={data} now={now} onShare={onShare} />;
}

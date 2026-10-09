// The Progreso detail pages (`/progreso/*`): the full data behind each hub tile. They share
// `useProgress` with the hub and reuse the sections of the old Progreso stack.
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { CompanionSection } from '../companion/CompanionSection';
import { useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { SectionHeader } from '../ui/SectionHeader';
import { useTheme } from '../ui/theme';
import { VolumeProgressSection } from '../volume/VolumeSection';

import type { ProgressData } from './loadProgress';
import {
  ConsistencySection,
  InsightsSection,
  MeasurementsSection,
  StrengthSection,
} from './ProgressSections';
import { buildProgressView, type ProgressView } from './progressView';
import { useProgress } from './useProgress';

type Ready = {
  data: ProgressData;
  view: ProgressView;
  twoColumns: boolean;
  saveMetric: (metricId: string, value: number) => Promise<void>;
};

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/progreso');
}

const EDGES = ['top', 'bottom', 'left', 'right'] as const;

/** Section header with back + the loading / error states of `useProgress`; `render` gets the data. */
function DetailScreen({
  title,
  render,
  footer,
  selectedStepId,
}: {
  title: string;
  render: (ready: Ready) => ReactNode;
  footer?: ReactNode;
  selectedStepId?: string | undefined;
}) {
  const theme = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const twoColumns = width >= theme.layout.twoColumnMin;
  const { state, load, saveMetric } = useProgress();

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const view = useMemo(
    () => (state.status === 'ready' ? buildProgressView(state.data, selectedStepId) : null),
    [state, selectedStepId],
  );

  const header = (
    <SectionHeader
      section="progreso"
      title={title}
      showSettings={false}
      back={{ label: t('progress.hub.back'), onPress: goBack }}
    />
  );
  if (state.status === 'error') {
    return (
      <Screen header={header} edges={EDGES}>
        <EmptyState
          compact
          title={t('progress.loadFailed')}
          body=""
          action={{ label: t('progress.retry'), onPress: () => void load() }}
        />
      </Screen>
    );
  }
  if (state.status !== 'ready' || !view) {
    return (
      <Screen header={header} edges={EDGES}>
        {null}
      </Screen>
    );
  }
  return (
    <Screen scroll wide header={header} edges={EDGES} footer={footer}>
      <View style={{ gap: theme.space[8], paddingVertical: theme.space[4] }}>
        {render({ data: state.data, view, twoColumns, saveMetric })}
      </View>
    </Screen>
  );
}

/** `/progreso/constancia`: sessions and habit days per week, and the weekly volume per muscle. */
export function ConsistencyDetailScreen() {
  const t = useT();
  return (
    <DetailScreen
      title={t('progress.hub.consistencyTitle')}
      render={({ data, view, twoColumns }) => (
        <>
          <ConsistencySection weekly={view.weekly} twoColumns={twoColumns} />
          {data.volume ? <VolumeProgressSection data={data.volume} /> : null}
        </>
      )}
    />
  );
}

/** `/progreso/fuerza`: estimated 1RM per exercise, with the exercise selector. */
export function StrengthDetailScreen() {
  const t = useT();
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>();
  return (
    <DetailScreen
      title={t('progress.hub.strengthTitle')}
      selectedStepId={selectedStepId}
      render={({ view }) => (
        <StrengthSection
          strength={view.strength}
          selectedId={selectedStepId}
          onSelect={setSelectedStepId}
        />
      )}
    />
  );
}

/** `/progreso/medidas`: each measurement with its chart and today's entry form. */
export function MeasurementsDetailScreen() {
  const t = useT();
  return (
    <DetailScreen
      title={t('progress.hub.measurementsTitle')}
      footer={
        <Button
          label={t('progress.hub.monthlyStart')}
          variant="secondary"
          onPress={() => router.push('/revision-mensual')}
        />
      }
      render={({ view, twoColumns, saveMetric }) => (
        <MeasurementsSection
          measurements={view.measurements}
          twoColumns={twoColumns}
          onSave={saveMetric}
        />
      )}
    />
  );
}

/** `/progreso/ritmo`: "Tu ritmo" (sleep debt, social jetlag, water curve, lifestyle profile). */
export function RhythmDetailScreen() {
  const t = useT();
  return (
    <DetailScreen
      title={t('progress.hub.rhythmTitle')}
      render={({ data }) =>
        data.companion ? (
          <CompanionSection companion={data.companion} />
        ) : (
          <Card>
            <EmptyState
              compact
              title={t('companion.title')}
              body={t('companion.sleepDebt.notEnough')}
            />
          </Card>
        )
      }
    />
  );
}

/** `/progreso/hallazgos`: every finding so far, newest first. */
export function InsightsDetailScreen() {
  const t = useT();
  return (
    <DetailScreen
      title={t('progress.hub.insightsTitle')}
      render={({ data }) => <InsightsSection insights={data.insights} />}
    />
  );
}

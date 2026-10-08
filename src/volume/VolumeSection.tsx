// Weekly volume per muscle (PLAN §9.4). The Gym tab shows this week; Progreso shows the last 4 or
// 8 weeks of one muscle. The reference range is information, never a goal.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { format, parseISO } from 'date-fns';

import { useLocaleStore, useT } from '../i18n';
import { BarChart } from '../ui/BarChart';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { useTheme } from '../ui/theme';
import type { Muscle } from '../domain/generator/types';

import type { VolumeData } from './loadVolume';
import {
  WEEK_CHOICES,
  buildVolumeView,
  formatSets,
  referenceFor,
  thisWeekRows,
  type WeekChoice,
} from './volumeView';

const SHORT_LABEL = 4;

function useMuscleName() {
  const t = useT();
  return (muscle: Muscle) => t(`creator.muscle.${muscle}`);
}

function useReferenceText() {
  const t = useT();
  return (range: { min: number; max: number } | null) =>
    range ? t('volume.reference', { min: range.min, max: range.max }) : null;
}

/** Gym tab: sets per muscle in the current ISO week. */
export function WeekVolumeCard({ data }: { data: VolumeData }) {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const name = useMuscleName();
  const referenceText = useReferenceText();
  const rows = thisWeekRows(data);

  return (
    <View style={{ gap: theme.space[3] }}>
      <Text
        accessibilityRole="header"
        style={[theme.text('title-md'), { color: theme.color.text }]}
      >
        {t('volume.thisWeekTitle')}
      </Text>
      {rows.length === 0 ? (
        <Card>
          <EmptyState compact title={t('volume.emptyTitle')} body={t('volume.emptyBody')} />
        </Card>
      ) : (
        <Card>
          <View style={{ gap: theme.space[3] }}>
            <BarChart
              bars={rows.map((row) => ({
                key: row.muscle,
                label: name(row.muscle).slice(0, SHORT_LABEL),
                value: row.sets,
                current: true,
              }))}
              formatY={(value) => formatSets(value, language)}
              summary={t('volume.summaryWeek', {
                list: rows
                  .map((row) =>
                    t('volume.row', {
                      muscle: name(row.muscle),
                      sets: formatSets(row.sets, language),
                    }),
                  )
                  .join('; '),
              })}
            />
            <View style={{ gap: theme.space[1] }}>
              {rows.map((row) => (
                <View key={row.muscle}>
                  <Text style={[theme.text('body'), { color: theme.color.text }]}>
                    {t('volume.row', {
                      muscle: name(row.muscle),
                      sets: formatSets(row.sets, language),
                    })}
                  </Text>
                  {referenceText(row.reference) ? (
                    <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                      {referenceText(row.reference)}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
            <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
              {`${t('volume.note')} ${t('volume.referenceInfo')}`}
            </Text>
          </View>
        </Card>
      )}
    </View>
  );
}

/** Progreso: the last 4 or 8 weeks of the selected muscle. */
export function VolumeProgressSection({ data }: { data: VolumeData }) {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const name = useMuscleName();
  const referenceText = useReferenceText();
  const [weeks, setWeeks] = useState<WeekChoice>(WEEK_CHOICES[0]);
  const [picked, setPicked] = useState<Muscle | undefined>(undefined);
  const view = buildVolumeView(data, weeks);
  const widest = buildVolumeView(data, WEEK_CHOICES[WEEK_CHOICES.length - 1] ?? weeks);
  const muscle =
    picked !== undefined && widest.muscles.includes(picked) ? picked : widest.muscles[0];

  return (
    <View style={{ gap: theme.space[3] }}>
      <Text
        accessibilityRole="header"
        style={[theme.text('title-sm'), { color: theme.color.text }]}
      >
        {t('volume.progressTitle')}
      </Text>
      {muscle === undefined ? (
        <Card>
          <EmptyState
            compact
            title={t('volume.progressEmptyTitle')}
            body={t('volume.progressEmptyBody')}
          />
        </Card>
      ) : (
        <Card>
          <View style={{ gap: theme.space[3] }}>
            <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
              {t('volume.chooseMuscle')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
              {widest.muscles.map((item) => (
                <Chip
                  key={item}
                  label={name(item)}
                  selected={item === muscle}
                  onPress={() => setPicked(item)}
                />
              ))}
            </View>
            <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
              {t('volume.chooseWeeks')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
              {WEEK_CHOICES.map((choice) => (
                <Chip
                  key={choice}
                  label={t('volume.weeks', { count: choice })}
                  accessibilityLabel={t('volume.weeksLabel', { count: choice })}
                  selected={choice === weeks}
                  onPress={() => setWeeks(choice)}
                />
              ))}
            </View>
            <BarChart
              bars={view.weeks.map((week) => ({
                key: week.weekStart,
                label: format(parseISO(week.weekStart), 'd/M'),
                value: week.sets[muscle] ?? 0,
                current: week.isCurrent,
              }))}
              formatY={(value) => formatSets(value, language)}
              summary={t('volume.summaryMuscle', {
                muscle: name(muscle),
                list: view.weeks
                  .map((week) =>
                    t('volume.bucket', {
                      date: format(parseISO(week.weekStart), 'd/M'),
                      sets: formatSets(week.sets[muscle] ?? 0, language),
                    }),
                  )
                  .join('; '),
              })}
            />
            {referenceText(referenceFor(data, muscle)) ? (
              <Text style={[theme.text('body'), { color: theme.color.text }]}>
                {referenceText(referenceFor(data, muscle))}
              </Text>
            ) : null}
            <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
              {`${t('volume.note')} ${t('volume.referenceInfo')}`}
            </Text>
          </View>
        </Card>
      )}
    </View>
  );
}

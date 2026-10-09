import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { getRepositories } from '../db';
import type { WeeklyItem } from '../domain/agenda/weekly';
import { useT } from '../i18n';
import { howItCountsLine } from '../today/howItCounts';
import { loadWeeklyItems } from '../today/todayData';
import { Card } from '../ui/Card';
import { useTheme } from '../ui/theme';

/** The week of the agenda item of `habitId` (null while loading, or when it is not planned). */
function useHabitWeek(habitId: string): WeeklyItem | null {
  const [week, setWeek] = useState<WeeklyItem | null>(null);
  useEffect(() => {
    let alive = true;
    loadWeeklyItems(getRepositories(), new Date())
      .then((items) => {
        if (!alive) return;
        setWeek(Object.values(items).find((entry) => entry.item.habitId === habitId) ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [habitId]);
  return week;
}

/** Habit detail: one line saying how the habit counts and when its reminders ring. */
export function HowItCounts({ habitId }: { habitId: string }) {
  const t = useT();
  const theme = useTheme();
  const week = useHabitWeek(habitId);
  if (!week) return null;
  return (
    <Card>
      <View style={{ gap: theme.space[1] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-sm'), { color: theme.color.text }]}
        >
          {t('today.how.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {howItCountsLine(week, t)}
        </Text>
      </View>
    </Card>
  );
}

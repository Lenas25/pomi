import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { getRepositories } from '../db';
import { resolveFreeWeekdays } from '../domain/companion/limits';
import { useT } from '../i18n';
import { Card } from '../ui/Card';
import { useTheme } from '../ui/theme';
import { WeekdayChips } from '../ui/WeekdayChips';

/** Ajustes > "Mis días libres": the free days of social jetlag, "Tu ritmo" and the insights. */
export function FreeDaysSettings() {
  const t = useT();
  const theme = useTheme();
  const [days, setDays] = useState<readonly number[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRepositories()
      .settings.get('freeDays')
      .then((stored) => {
        if (!cancelled) setDays(resolveFreeWeekdays(stored));
      })
      .catch(() => {
        if (!cancelled) setDays(resolveFreeWeekdays(undefined));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (days === null) return null;

  const change = (next: number[]) => {
    setFailed(false);
    setDays(next);
    getRepositories()
      .settings.set('freeDays', next)
      .catch(() => setFailed(true));
  };

  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-sm'), { color: theme.color.text }]}
        >
          {t('settings.freeDays.title')}
        </Text>
        <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
          {t('settings.freeDays.hint')}
        </Text>
        <WeekdayChips
          selected={days}
          onChange={change}
          accessibilityLabel={t('settings.freeDays.title')}
        />
        {failed ? (
          <Text
            accessibilityRole="alert"
            style={[theme.text('caption'), { color: theme.color.error }]}
          >
            {t('settings.freeDays.saveFailed')}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

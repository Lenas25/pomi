// "Horas para dormir" (PLAN §14b, v1 calculator): "si te despiertas a las X, intenta dormir a...".
// Opened from the bedtime row of Hoy, from Progreso > Tu ritmo and from Ajustes. Pure engine:
// `sleepCycleBedtimes` (wake - n x 90 min - 15 min).
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { getRepositories } from '../db';
import { sleepCycleBedtimes } from '../domain/formulas/sleep';
import { useLocaleStore, useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { TimeStepper } from '../ui/Stepper';
import { useTheme } from '../ui/theme';

import { durationText } from './text';

/** Wake time shown when the plan has none yet. */
const FALLBACK_WAKE = '06:30';

export function SleepCalcScreen() {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const [wake, setWake] = useState(FALLBACK_WAKE);
  const [targetH, setTargetH] = useState<number | undefined>();

  // Starts from the plan; the person can try any wake time without changing the plan.
  useEffect(() => {
    let cancelled = false;
    void getRepositories()
      .settings.get('anchors')
      .then((anchors) => {
        if (cancelled || !anchors) return;
        if (anchors.wake) setWake(anchors.wake);
        setTargetH(anchors.sleepTargetH);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const options = sleepCycleBedtimes(wake);

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('sleepCalc.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('sleepCalc.intro')}
        </Text>

        <Card>
          <TimeStepper label={t('sleepCalc.wakeLabel')} value={wake} onChange={setWake} />
        </Card>

        <View accessibilityLiveRegion="polite" style={{ gap: theme.space[2] }}>
          {options.map((option) => {
            const duration = durationText(option.sleepMin);
            return (
              <Card key={option.cycles}>
                <View
                  accessible
                  accessibilityLabel={t('sleepCalc.optionLabel', {
                    bedtime: option.bedtime,
                    cycles: option.cycles,
                    duration,
                  })}
                  style={{ gap: theme.space[1] }}
                >
                  <Text style={[theme.text('title-lg'), { color: theme.color.text }]}>
                    {t('sleepCalc.option', { bedtime: option.bedtime })}
                  </Text>
                  <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                    {t('sleepCalc.cycles', { cycles: option.cycles, duration })}
                  </Text>
                </View>
              </Card>
            );
          })}
        </View>

        {targetH !== undefined ? (
          <Text style={[theme.text('body'), { color: theme.color.text }]}>
            {t('sleepCalc.goal', { hours: targetH.toLocaleString(language) })}
          </Text>
        ) : null}
        <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
          {t('sleepCalc.note')}
        </Text>

        <Button label={t('sleepCalc.back')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

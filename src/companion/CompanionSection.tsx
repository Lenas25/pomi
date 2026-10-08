// "Tu ritmo" in Progreso (PLAN §14b): sleep debt, social jetlag, the water curve and the lifestyle
// profile. Prudent wording, no alarms; every card says what it is based on.
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import type { Companion } from '../domain/companion';
import { useLocaleStore, useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { LineChart } from '../ui/LineChart';
import { useTheme } from '../ui/theme';

import { jetlagLines, rhythmLines, sleepDebtLines, waterLines } from './text';

function Line({ children, muted = false }: { children: string; muted?: boolean }) {
  const theme = useTheme();
  return (
    <Text
      style={[
        muted ? theme.text('caption') : theme.text('body'),
        { color: muted ? theme.color.textMuted : theme.color.text },
      ]}
    >
      {children}
    </Text>
  );
}

function CardTitle({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" style={[theme.text('title-sm'), { color: theme.color.text }]}>
      {children}
    </Text>
  );
}

export function CompanionSection({ companion }: { companion: Companion }) {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const debt = sleepDebtLines(companion.sleepDebt, t, language);
  const jetlag = jetlagLines(companion.jetlag, t);
  const water = waterLines(companion.water, t);
  const rhythm = rhythmLines(companion.rhythm, t, language);

  return (
    <View style={{ gap: theme.space[3] }}>
      <Text
        accessibilityRole="header"
        style={[theme.text('title-sm'), { color: theme.color.text }]}
      >
        {t('companion.title')}
      </Text>
      <Line muted>{t('companion.intro')}</Line>

      <Card>
        <View style={{ gap: theme.space[2] }}>
          <CardTitle>{t('companion.sleepDebt.title')}</CardTitle>
          {'missing' in debt ? (
            <Line muted>{debt.missing}</Line>
          ) : (
            <>
              <Line>{debt.headline}</Line>
              <Line muted>{debt.basis}</Line>
            </>
          )}
          <Button
            label={t('sleepCalc.entry.title')}
            variant="secondary"
            onPress={() => router.push('/ciclos-sueno')}
          />
        </View>
      </Card>

      <Card>
        <View style={{ gap: theme.space[2] }}>
          <CardTitle>{t('companion.jetlag.title')}</CardTitle>
          {'missing' in jetlag ? (
            <Line muted>{jetlag.missing}</Line>
          ) : (
            <>
              <Line>{jetlag.headline}</Line>
              <Line muted>{jetlag.basis}</Line>
            </>
          )}
        </View>
      </Card>

      <Card>
        <View style={{ gap: theme.space[2] }}>
          <CardTitle>{t('companion.water.title')}</CardTitle>
          {'missing' in water || !companion.water ? (
            <Line muted>{'missing' in water ? water.missing : ''}</Line>
          ) : (
            <>
              <Line>{water.headline}</Line>
              <LineChart
                points={companion.water.byHour.map((entry) => ({
                  x: entry.hour,
                  y: entry.glasses,
                }))}
                formatX={(hour) => t('companion.water.hourLabel', { hour })}
                formatY={(value) => String(value)}
                summary={water.summary}
              />
              <Line muted>{water.basis}</Line>
            </>
          )}
        </View>
      </Card>

      <Card>
        <View style={{ gap: theme.space[2] }}>
          <CardTitle>{t('companion.rhythm.title')}</CardTitle>
          {'learning' in rhythm ? (
            <>
              <Line>{rhythm.learning}</Line>
              <Line muted>{rhythm.body}</Line>
            </>
          ) : (
            <>
              {rhythm.lines.map((line, index) => (
                <Line key={index} muted={line.muted}>
                  {line.text}
                </Line>
              ))}
              <Line muted>{rhythm.basis}</Line>
            </>
          )}
        </View>
      </Card>
    </View>
  );
}

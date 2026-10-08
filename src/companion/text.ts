// Turns the numbers of the companion engines into the sentences a person reads. The engines only
// produce numbers; the wording (prudent, never causal, no guilt) lives in i18n `companion.*`.
import { minutesToClock } from '../domain/time';
import type { Companion, TodayCard } from '../domain/companion';
import type { Language, Translate } from '../i18n';

/** Missing sleep under this is "almost nothing". */
const LITTLE_DEBT_MIN = 30;

const WEEKDAY_KEYS = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6'] as const;

/** Hours rounded to the nearest half hour: "3", "1,5". */
export function hoursText(minutes: number, language: Language): string {
  const half = Math.round(minutes / 30) / 2;
  return `${half.toLocaleString(language)} h`;
}

/** "1 h 20 min", "45 min". */
export function durationText(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const hourClock = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export type SleepDebtLines = { headline: string; basis: string } | { missing: string };

export function sleepDebtLines(
  debt: Companion['sleepDebt'],
  t: Translate,
  language: Language,
): SleepDebtLines {
  if (!debt) return { missing: t('companion.sleepDebt.notEnough') };
  const headline =
    debt.debtMin >= LITTLE_DEBT_MIN
      ? t('companion.sleepDebt.some', { hours: hoursText(debt.debtMin, language) })
      : debt.debtMin > 0
        ? t('companion.sleepDebt.little')
        : t('companion.sleepDebt.none');
  return { headline, basis: t('companion.sleepDebt.basis', { count: debt.days }) };
}

export type JetlagLines = { headline: string; basis: string } | { missing: string };

export function jetlagLines(jetlag: Companion['jetlag'], t: Translate): JetlagLines {
  if (!jetlag) return { missing: t('companion.jetlag.notEnough') };
  const time = durationText(jetlag.jetlagMin);
  return {
    headline: t(jetlag.notable ? 'companion.jetlag.notable' : 'companion.jetlag.small', { time }),
    basis: t('companion.jetlag.basis', { free: jetlag.freeNights, work: jetlag.workNights }),
  };
}

export type WaterLines =
  { headline: string; basis: string; summary: string; gap: boolean } | { missing: string };

export function waterLines(water: Companion['water'], t: Translate): WaterLines {
  if (!water) return { missing: t('companion.water.notEnough') };
  const at = (hour: number) => water.byHour.find((entry) => entry.hour === hour)?.glasses ?? 0;
  return {
    headline: water.gap
      ? t('companion.water.gap', {
          from: hourClock(water.gap.fromHour),
          to: hourClock(water.gap.toHour),
        })
      : t('companion.water.steady'),
    basis: t('companion.water.basis', { count: water.days }),
    summary: t('companion.water.summary', {
      morning: at(12),
      afternoon: at(18),
      night: at(22),
    }),
    gap: water.gap !== null,
  };
}

export type RhythmLine = { text: string; muted: boolean };

export type RhythmLines =
  { learning: string; body: string } | { lines: RhythmLine[]; basis: string };

export function rhythmLines(
  rhythm: Companion['rhythm'],
  t: Translate,
  language: Language,
): RhythmLines {
  if (!rhythm.ready) {
    return {
      learning: t('companion.rhythm.learning', {
        days: Math.min(rhythm.daysWithData, rhythm.needed),
        needed: rhythm.needed,
      }),
      body: t('companion.rhythm.learningBody'),
    };
  }
  const lines: RhythmLine[] = [];
  if (rhythm.chronotype) {
    lines.push(
      {
        text: t(`companion.rhythm.chronotype.${rhythm.chronotype.tendency}`, {
          time: minutesToClock(rhythm.chronotype.midSleepMin),
        }),
        muted: false,
      },
      { text: t('companion.rhythm.chronotype.note'), muted: true },
    );
  }
  if (rhythm.activeWeekdays.length > 0) {
    const names = rhythm.activeWeekdays.map((weekday) => {
      const key = WEEKDAY_KEYS[weekday];
      return key ? t(`weekdays.long.${key}`) : '';
    });
    lines.push({
      text: t('companion.rhythm.activeDays', {
        days: names.join(t('companion.rhythm.activeDaysAnd')),
      }),
      muted: false,
    });
  }
  if (rhythm.energy.status === 'found') {
    const { diff, enoughDays, shortDays } = rhythm.energy.value;
    lines.push(
      {
        text: t(diff >= 0 ? 'companion.rhythm.energy.higher' : 'companion.rhythm.energy.lower', {
          diff: Math.abs(diff).toLocaleString(language, { minimumFractionDigits: 1 }),
        }),
        muted: false,
      },
      {
        text: t('companion.rhythm.energy.basis', { enough: enoughDays, short: shortDays }),
        muted: true,
      },
    );
  } else {
    lines.push({
      text: t(
        rhythm.energy.status === 'none'
          ? 'companion.rhythm.energy.none'
          : 'companion.rhythm.energy.insufficient',
      ),
      muted: false,
    });
  }
  return { lines, basis: t('companion.rhythm.basis', { days: rhythm.daysWithData }) };
}

export type CardTexts = { title: string; body: string };

/** Texts of the one card Hoy may show. */
export function todayCardTexts(card: TodayCard, t: Translate, language: Language): CardTexts {
  switch (card.kind) {
    case 'sleepDebt':
      return {
        title: t('companion.card.sleepDebt.title', { hours: hoursText(card.debtMin, language) }),
        body: t('companion.card.sleepDebt.body'),
      };
    case 'jetlag':
      return {
        title: t('companion.card.jetlag.title'),
        body: t('companion.card.jetlag.body', { time: durationText(card.jetlagMin) }),
      };
    case 'waterGap':
      return {
        title: t('companion.card.waterGap.title'),
        body: t('companion.card.waterGap.body', {
          from: hourClock(card.fromHour),
          to: hourClock(card.toHour),
        }),
      };
  }
}

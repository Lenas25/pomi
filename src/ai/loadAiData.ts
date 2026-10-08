// Repositories -> `AiSnapshot` for "Conectar mi IA". Reads only; every number comes from the
// existing deterministic engines (report builder, companion engines, weekly volume). Photos are
// never read here.
import type { Repositories } from '../db/repositories';
import { averageRating, textAnswers } from '../domain/ai/checkins';
import type { AiSnapshot } from '../domain/ai/context';
import { dayKeyFor } from '../domain/time';
import { translateIn, type Language, type Translate } from '../i18n';
import { insightTexts } from '../insights/text';
import { loadCompanion } from '../companion/loadCompanion';
import { buildReport } from '../reports/buildReport';
import { loadReportData } from '../reports/loadReportData';
import { periodFor } from '../reports/period';
import type { GymReport, HabitsReport, ReportData, SleepReport } from '../reports/types';
import { RATING_QUESTION_IDS } from '../review/loadReview';
import { parsePayload } from '../suggestions/payload';
import { suggestionTexts } from '../suggestions/text';
import { loadVolumeData } from '../volume/loadVolume';
import { thisWeekRows } from '../volume/volumeView';

export const AI_PERIOD_DAYS = 30;
/** Night check-in question with the optional free text ("Algo que quieras recordar de hoy"). */
export const DAY_NOTE_QUESTION_ID = 'nota';
const MAX_EXERCISES = 8;
const MAX_INSIGHTS = 3;
const MAX_SUGGESTIONS = 2;

type Parts = {
  today: string;
  gym: GymReport | undefined;
  habits: HabitsReport | undefined;
  sleep: SleepReport | undefined;
};

function sectionsOf(data: ReportData, now: Date): Parts {
  const model = buildReport(
    data,
    {
      template: 'custom',
      sections: ['gym', 'habits', 'sleep'],
      period: '30d',
      note: '',
      foodNotes: false,
    },
    now,
  );
  const find = <K extends 'gym' | 'habits' | 'sleep'>(kind: K) =>
    model.sections.find((section) => section.kind === kind) as
      Extract<(typeof model.sections)[number], { kind: K }> | undefined;
  return { today: model.period.to, gym: find('gym'), habits: find('habits'), sleep: find('sleep') };
}

export async function loadAiSnapshot(
  repos: Repositories,
  now: Date,
  language: Language,
): Promise<AiSnapshot> {
  const tr: Translate = (key, options) => translateIn(language, key, options);
  const today = dayKeyFor(now);
  const data = await loadReportData(repos, now);
  const { gym, habits, sleep } = sectionsOf(data, now);
  const { from } = periodFor('30d', now);

  const [companion, volume, checkinRows, foodRows, pending] = await Promise.all([
    loadCompanion(repos, today),
    loadVolumeData(repos, today),
    repos.checkins.inRange(from, today),
    repos.foodNotes.inRange(from, today),
    repos.suggestions.pending(),
  ]);
  const morning = checkinRows.filter((row) => row.kind === 'morning');
  const night = checkinRows.filter((row) => row.kind === 'night');

  const suggestions = pending.flatMap((row) => {
    const payload = parsePayload(row.payload);
    return payload ? [suggestionTexts(payload, tr, language).text] : [];
  });

  return {
    today,
    periodDays: AI_PERIOD_DAYS,
    sleep:
      sleep && !sleep.empty
        ? {
            nights: sleep.nights,
            averageMin: sleep.averageMin,
            targetMin: sleep.targetMin,
            wakeRangeMin: sleep.wakeRangeMin,
            debtMin: companion.sleepDebt?.debtMin ?? null,
            socialJetlagMin: companion.jetlag?.jetlagMin ?? null,
          }
        : null,
    water: habits?.water
      ? {
          daysLogged: habits.water.daysLogged,
          daysMet: habits.water.daysMet,
          averageGlasses: habits.water.averageGlasses,
          glassMl: habits.water.glassMl ?? null,
          afternoonGap: companion.water?.gap ?? null,
        }
      : null,
    movement: habits?.steps
      ? {
          stepsDaysLogged: habits.steps.daysLogged,
          stepsAverage: habits.steps.average,
          stepsGoal: habits.steps.goal,
          stepsDaysMet: habits.steps.daysMet,
          activeWeekdays: companion.rhythm.activeWeekdays,
        }
      : null,
    gym:
      gym && !gym.empty
        ? {
            sessionsDone: gym.sessionsDone,
            sessionsPlanned: gym.sessionsPlanned,
            exercises: [...gym.exercises]
              .sort((a, b) => b.sessions - a.sessions)
              .slice(0, MAX_EXERCISES)
              .map((exercise) => ({
                name: exercise.name,
                sessions: exercise.sessions,
                sets: exercise.sets,
                e1rmFirstKg: exercise.e1rmFrom,
                e1rmLastKg: exercise.e1rmTo,
                topWeightKg: exercise.topWeightKg,
                bestReps: exercise.bestReps,
              })),
            setsThisWeek: thisWeekRows(volume).map((row) => ({
              muscle: tr(`creator.muscle.${row.muscle}`),
              sets: row.sets,
              referenceMin: row.reference?.min ?? null,
              referenceMax: row.reference?.max ?? null,
            })),
          }
        : null,
    checkins:
      checkinRows.length > 0
        ? {
            days: new Set(checkinRows.map((row) => row.date)).size,
            energyAverage: averageRating(night, RATING_QUESTION_IDS.energy),
            moodAverage: averageRating(night, RATING_QUESTION_IDS.mood),
            sleepQualityAverage: averageRating(morning, RATING_QUESTION_IDS.quality),
          }
        : null,
    insights: data.findings
      .slice(0, MAX_INSIGHTS)
      .map((insight) => insightTexts(insight, tr, language).text),
    suggestions: suggestions.slice(0, MAX_SUGGESTIONS),
    foodNotes: foodRows.map((row) => ({ date: row.date, text: row.text })),
    dayNotes: textAnswers(night, DAY_NOTE_QUESTION_ID),
  };
}

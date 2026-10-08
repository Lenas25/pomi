// Load / save of a check-in. The questions come from the metrics template; the plan anchors
// prefill the morning times; the night food note lives in `food_notes` (not in the answers).
import { format, parseISO, subDays } from 'date-fns';

import { DEFAULT_BED, DEFAULT_WAKE } from '../domain/onboarding/draft';
import { bedtimeFor } from '../domain/formulas/sleep';
import {
  adjustClock,
  initialAnswers,
  toMorningCheckin,
  validateAnswers,
  type AnswerValue,
  type CheckinAnswers,
  type CheckinKind,
  type PrefillContext,
} from '../domain/habits/checkins';
import type { Repositories } from '../db/repositories';
import { withTransaction } from '../db/transaction';
import type { Db } from '../db/types';
import type { CheckinQuestion } from '../templates/schema';
import { templateText } from '../i18n/templateText';

export type CheckinPlan = {
  kind: CheckinKind;
  questions: readonly CheckinQuestion[];
  /** Prompt of the food-notes module when it is active (night only), else `null`. */
  foodPrompt: string | null;
  answers: CheckinAnswers;
  foodNote: string;
};

export type LoadedCheckin =
  | { status: 'ready'; plan: CheckinPlan }
  /** The person turned this check-in off in the onboarding / settings. */
  | { status: 'disabled' }
  /** No active module defines questions for this check-in. */
  | { status: 'missing' };

/** How far back the last LOGGED bedtime is looked up. */
const BED_LOOKBACK_DAYS = 14;

/** The bedtime of the most recent earlier morning check-in, or `undefined` when none logged one. */
async function lastLoggedBed(
  repos: Repositories,
  questions: readonly CheckinQuestion[],
  today: string,
): Promise<string | undefined> {
  const base = parseISO(today);
  const rows = await repos.checkins.inRange(
    format(subDays(base, BED_LOOKBACK_DAYS), 'yyyy-MM-dd'),
    format(subDays(base, 1), 'yyyy-MM-dd'),
    'morning',
  );
  const logged = rows
    .flatMap((row) => toMorningCheckin(row.date, questions, row.answers) ?? [])
    .sort((a, b) => b.date.localeCompare(a.date));
  return logged[0]?.bed;
}

export async function loadCheckin(
  repos: Repositories,
  kind: CheckinKind,
  today: string,
): Promise<LoadedCheckin> {
  const prefs = await repos.settings.get('checkinPrefs');
  if (prefs && !prefs[kind]) return { status: 'disabled' };

  const modules = (await repos.templates.listModules()).filter((module) => module.active);
  const questions = modules.find((module) => module.template.checkins?.[kind])?.template.checkins?.[
    kind
  ];
  if (!questions || questions.length === 0) return { status: 'missing' };

  const anchors = await repos.settings.get('anchors');
  const wake = anchors?.wake ?? DEFAULT_WAKE;
  // Last night's bedtime: what the person LOGGED last time (their real habit), else the planned
  // one (wake − sleep target, moved earlier by an accepted "dormir antes"), else the default.
  const shifts = await repos.settings.get('planShifts');
  const planned = anchors?.sleepTargetH ? bedtimeFor(wake, anchors.sleepTargetH) : undefined;
  const logged = kind === 'morning' ? await lastLoggedBed(repos, questions, today) : undefined;
  const bed = logged ?? (planned ? adjustClock(planned, shifts?.bedMin ?? 0) : DEFAULT_BED);
  const context: PrefillContext = { bed, wake };

  const saved = await repos.checkins.get(today, kind);
  const previous = saved ? toAnswers(saved.answers) : {};
  const foodPrompt =
    kind === 'night'
      ? (templateText(modules.find((module) => module.template.notes)?.template.notes?.prompt) ??
        null)
      : null;
  const food = foodPrompt === null ? undefined : await repos.foodNotes.forDate(today);

  return {
    status: 'ready',
    plan: {
      kind,
      questions,
      foodPrompt,
      answers: initialAnswers(questions, context, previous),
      foodNote: food?.text ?? '',
    },
  };
}

function toAnswers(raw: Readonly<Record<string, unknown>>): CheckinAnswers {
  const answers: CheckinAnswers = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' || typeof value === 'number') answers[key] = value;
  }
  return answers;
}

export type SaveResult =
  | { ok: true }
  /** `question` is the first unanswered / invalid question, for the message. */
  | { ok: false; question: CheckinQuestion };

/** Validates, then writes the answers (and the food note) in one transaction. */
export async function saveCheckin(
  db: Db,
  repos: Repositories,
  plan: CheckinPlan,
  today: string,
  raw: Readonly<Record<string, AnswerValue | undefined>>,
  foodNote: string,
): Promise<SaveResult> {
  const result = validateAnswers(plan.questions, raw);
  if (!result.ok) {
    const firstId = [...result.missing, ...result.invalid][0];
    const question = plan.questions.find((candidate) => candidate.id === firstId);
    return { ok: false, question: question ?? plan.questions[0]! };
  }
  await withTransaction(db, async (tx) => {
    await repos.checkins.upsert(today, plan.kind, result.answers);
    if (plan.foodPrompt !== null) await repos.foodNotes.saveIn(tx, today, foodNote);
  });
  return { ok: true };
}

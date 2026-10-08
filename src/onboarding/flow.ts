// Order of the onboarding questions (PLAN §8) and the routes between them.

export const QUESTION_IDS = [
  'name',
  'body',
  'age',
  'work',
  'freeDays',
  'sleepClock',
  'sleepHours',
  'gym',
  'level',
  'goal',
  'steps',
  'checkins',
  'permissions',
] as const;

export type QuestionId = (typeof QUESTION_IDS)[number];

export const TOTAL_QUESTIONS = QUESTION_IDS.length;
export const SUMMARY_HREF = '/onboarding/summary';

export function isQuestionId(value: unknown): value is QuestionId {
  return typeof value === 'string' && (QUESTION_IDS as readonly string[]).includes(value);
}

/** The first question is the index route; the others live under `/onboarding/<id>`. */
export function questionHref(id: QuestionId): string {
  return id === QUESTION_IDS[0] ? '/onboarding' : `/onboarding/${id}`;
}

/** 1-based position, for "Pregunta 3 de 12". */
export function questionNumber(id: QuestionId): number {
  return QUESTION_IDS.indexOf(id) + 1;
}

/** Route after answering or skipping `id`; the last question leads to "Tu punto de partida". */
export function nextHref(id: QuestionId): string {
  const next = QUESTION_IDS[QUESTION_IDS.indexOf(id) + 1];
  return next === undefined ? SUMMARY_HREF : questionHref(next);
}

export function isFirstQuestion(id: QuestionId): boolean {
  return id === QUESTION_IDS[0];
}

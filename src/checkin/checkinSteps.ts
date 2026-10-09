// Pure view model of the step-by-step check-in: which questions go on which step, and the short
// summary of the finish screen. Texts are i18n keys + params.
import type { AnswerValue, CheckinKind } from '../domain/habits/checkins';
import { forwardMinutes } from '../domain/time';
import type { TranslationKey } from '../i18n';
import type { CheckinQuestion } from '../templates/schema';

export type CheckinStepId = 'times' | 'rate' | 'done';

export type CheckinStep = {
  id: CheckinStepId;
  /** The questions of the step (none on `done`). */
  questions: CheckinQuestion[];
};

/**
 * Times first ("Sueño"), then scales and notes ("Calidad"), then the finish step ("Listo"). A step
 * without questions is skipped, so a check-in with only scales has two steps.
 */
export function checkinSteps(questions: readonly CheckinQuestion[]): CheckinStep[] {
  const times = questions.filter((question) => question.type === 'time');
  const rate = questions.filter((question) => question.type !== 'time');
  const steps: CheckinStep[] = [];
  if (times.length > 0) steps.push({ id: 'times', questions: times });
  if (rate.length > 0) steps.push({ id: 'rate', questions: rate });
  steps.push({ id: 'done', questions: [] });
  return steps;
}

/** Face labels of a 1-5 scale, worst to best ("Mal · Regular · Bien · Muy bien · Genial"). */
export const FACE_KEYS: readonly TranslationKey[] = [
  'checkin.scaleFaces.f1',
  'checkin.scaleFaces.f2',
  'checkin.scaleFaces.f3',
  'checkin.scaleFaces.f4',
  'checkin.scaleFaces.f5',
];

/** The face label of a scale answer, when the scale has exactly five points. */
export function faceKey(question: CheckinQuestion, value: number): TranslationKey | null {
  if (question.type !== 'scale') return null;
  const [min, max] = question.scale;
  if (max - min + 1 !== FACE_KEYS.length) return null;
  return FACE_KEYS[value - min] ?? null;
}

export type SummaryPart = {
  key: TranslationKey;
  params: Record<string, string | number>;
  /** The face word to translate into `{{face}}`. */
  faceKey?: TranslationKey;
};

const clockAnswer = (
  questions: readonly CheckinQuestion[],
  answers: Readonly<Record<string, AnswerValue | undefined>>,
  prefill: 'bed' | 'wake',
): string | null => {
  const question = questions.find((item) => item.type === 'time' && item.prefill === prefill);
  const value = question ? answers[question.id] : undefined;
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : null;
};

/**
 * The finish line, e.g. "Dormiste 7 h 10 · calidad Bien": the sleep length when both the bed and
 * wake times are there, then the face of the first 1-5 scale ("calidad" in the morning, "tu día"
 * at night). The face is passed as its i18n key (`faceKey`); the screen translates it.
 */
export function checkinSummary(
  kind: CheckinKind,
  questions: readonly CheckinQuestion[],
  answers: Readonly<Record<string, AnswerValue | undefined>>,
): SummaryPart[] {
  const parts: SummaryPart[] = [];
  const bed = clockAnswer(questions, answers, 'bed');
  const wake = clockAnswer(questions, answers, 'wake');
  if (bed && wake) {
    const minutes = forwardMinutes(bed, wake);
    parts.push({
      key: 'checkin.summary.slept',
      params: { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') },
    });
  }
  const faces = questions.flatMap((question) => {
    const value = answers[question.id];
    const key = typeof value === 'number' ? faceKey(question, value) : null;
    return key ? [key] : [];
  });
  const first = faces[0];
  if (first) {
    parts.push({
      key: kind === 'morning' ? 'checkin.summary.quality' : 'checkin.summary.day',
      params: {},
      faceKey: first,
    });
  }
  return parts;
}

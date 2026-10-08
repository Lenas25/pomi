// PAR-Q+ general health screening (docs/evidence/training.md section 10, E10). Pure: the seven
// answers in, what the app must do out. Pomi never presents this as medical clearance.
import type { Screening } from './types';

export const PARQ_QUESTION_COUNT = 7;

/** Question numbers (1-based) whose "yes" the form treats as a referral rather than a follow-up. */
export const PARQ_REFERRAL_QUESTIONS: readonly number[] = [1, 2, 3, 7];
/** Question 2 (chest pain): the notice is the strongest one. */
export const PARQ_CHEST_PAIN_QUESTION = 2;
/** Question 6 (bone, joint or soft tissue problem) also feeds the "limitations" input. */
export const PARQ_LIMITATIONS_QUESTION = 6;

export type ParqOutcome = {
  complete: boolean;
  anyYes: boolean;
  /** 1-based numbers of the questions answered yes. */
  yesQuestions: number[];
  chestPain: boolean;
  /** Question 6 was yes: ask which joints. */
  joints: boolean;
};

export function evaluateParq(answers: readonly (boolean | null)[]): ParqOutcome {
  const complete =
    answers.length === PARQ_QUESTION_COUNT && answers.every((answer) => answer !== null);
  const yesQuestions = answers.flatMap((answer, index) => (answer === true ? [index + 1] : []));
  return {
    complete,
    anyYes: yesQuestions.length > 0,
    yesQuestions,
    chestPain: yesQuestions.includes(PARQ_CHEST_PAIN_QUESTION),
    joints: yesQuestions.includes(PARQ_LIMITATIONS_QUESTION),
  };
}

export type ScreeningStatus =
  /** Not all seven questions answered. */
  | 'incomplete'
  /** All "no": generate normally. */
  | 'cleared'
  /** Some "yes", not acknowledged yet: no generation. */
  | 'acknowledgementRequired'
  /** Some "yes", acknowledged: generation limited to the low-intensity beginner template. */
  | 'restricted';

export function screeningStatus(screening: Screening): ScreeningStatus {
  if (screening.answers.length !== PARQ_QUESTION_COUNT) return 'incomplete';
  if (!screening.answers.some(Boolean)) return 'cleared';
  return screening.acknowledged ? 'restricted' : 'acknowledgementRequired';
}

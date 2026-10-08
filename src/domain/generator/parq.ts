// PAR-Q+ general health screening (docs/evidence/training.md section 10, E10). Pure: the seven
// answers in, what the app must do out. Pomi never presents this as medical clearance.
import type { Screening } from './types';

export const PARQ_QUESTION_COUNT = 7;

/**
 * Question numbers (1-based) whose "yes" BLOCKS generation: 2 (chest pain: stop and see a doctor)
 * and 7 (only medically supervised activity). Any other "yes" only restricts the routine (E10).
 */
export const PARQ_REFERRAL_QUESTIONS: readonly number[] = [2, 7];
/** Question 2 (chest pain): the notice is the strongest one. */
export const PARQ_CHEST_PAIN_QUESTION = 2;
/** Question 6 (bone, joint or soft tissue problem) also feeds the "limitations" input. */
export const PARQ_LIMITATIONS_QUESTION = 6;

export type ParqOutcome = {
  complete: boolean;
  anyYes: boolean;
  /** A referral question (`PARQ_REFERRAL_QUESTIONS`) was answered yes: no routine is generated. */
  referral: boolean;
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
    referral: yesQuestions.some((question) => PARQ_REFERRAL_QUESTIONS.includes(question)),
    yesQuestions,
    chestPain: yesQuestions.includes(PARQ_CHEST_PAIN_QUESTION),
    joints: yesQuestions.includes(PARQ_LIMITATIONS_QUESTION),
  };
}

export type ScreeningStatus =
  /** Not all seven questions answered. */
  | 'incomplete'
  /** A "yes" to question 2 or 7: no generation, the person is referred to a professional. */
  | 'referral'
  /** All "no": generate normally. */
  | 'cleared'
  /** Some "yes", not acknowledged yet: no generation. */
  | 'acknowledgementRequired'
  /** Some other "yes", acknowledged: the gentle machines-and-body-weight beginner routine. */
  | 'restricted';

export function screeningStatus(screening: Screening): ScreeningStatus {
  if (screening.answers.length !== PARQ_QUESTION_COUNT) return 'incomplete';
  if (evaluateParq(screening.answers).referral) return 'referral';
  if (!screening.answers.some(Boolean)) return 'cleared';
  return screening.acknowledged ? 'restricted' : 'acknowledgementRequired';
}

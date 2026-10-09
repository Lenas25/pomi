// Pure helpers that pick the program to train and build the rotation input from stored sessions.
import type { RotationSession } from '../domain/gym/rotation';
import { DEFAULT_TARGET_RULES, type TargetRules } from '../domain/gym/todayTarget';
import type { ModuleTemplate } from '../templates/schema';
import type { LocalizedText } from '../templates/localized';

export type ProgramModule = Pick<ModuleTemplate, 'id' | 'name' | 'programs'>;
type ProgramOf = NonNullable<ModuleTemplate['programs']>[number];

export type GymProgram = {
  moduleName: LocalizedText;
  id: string;
  name: LocalizedText;
  routines: ProgramOf['routines'];
  rules: TargetRules;
};

/** Recent sessions read to resolve the rotation (today's routine). */
export const ROTATION_LOOKBACK = 40;

/** The first program of the first active module that has one (a single program is trained). */
export function pickProgram(
  modules: readonly { active: boolean; template: ProgramModule }[],
): GymProgram | null {
  for (const { active, template } of modules) {
    if (!active) continue;
    const program = template.programs?.[0];
    if (!program) continue;
    return {
      moduleName: template.name,
      id: program.id,
      name: program.name,
      routines: program.routines,
      rules: {
        stallSessions: program.rules?.stallSessions ?? DEFAULT_TARGET_RULES.stallSessions,
        deloadPct: program.rules?.deloadPct ?? DEFAULT_TARGET_RULES.deloadPct,
      },
    };
  }
  return null;
}

type SessionLike = {
  session: { routineId: string; date: string; startedAt: number; finishedAt: number | null };
  sets: readonly unknown[];
};

export function toRotationSessions(rows: readonly SessionLike[]): RotationSession[] {
  return rows.map(({ session, sets }) => ({
    routineId: session.routineId,
    date: session.date,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    setCount: sets.length,
  }));
}

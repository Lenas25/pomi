import { z } from 'zod';

import { parseReps } from '../domain/gym/reps';
import { localizedTextSchema } from './localized';

/**
 * Template schema (schemaVersion 2). Extends PLAN §6.2.
 *
 * Custom validation messages are stable codes (`custom:*`) that the importer maps to i18n keys.
 * Every object is strict: an unknown key (usually a typo such as `repz`) is an error. Keys that
 * start with `_` (e.g. `_note`) are author comments; the importer strips them before validating.
 */

export const TEMPLATE_SCHEMA_VERSION = 2;

export const CUSTOM_CODES = {
  time: 'custom:time',
  icon: 'custom:icon',
  schedule: 'custom:schedule',
  scale: 'custom:scale',
  duplicateId: 'custom:duplicateId',
  condition: 'custom:condition',
  flagValue: 'custom:flagValue',
  repsLanguages: 'custom:repsLanguages',
} as const;

const idSchema = z.string().min(1);
/** User-facing names accept a plain string or `{ es, en? }` (see `localized.ts`). */
const nameSchema = localizedTextSchema(1);
const freeTextSchema = localizedTextSchema(0);
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, CUSTOM_CODES.time);
const weekdaySchema = z.number().int().min(0).max(6);
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();

/** Phosphor icon component name, e.g. `Barbell`. Emoji and free text are rejected. */
export const iconSchema = z.string().regex(/^[A-Z][A-Za-z0-9]*$/, CUSTOM_CODES.icon);

export const anchorNameSchema = z.enum(['wake', 'bed', 'gymMorning', 'gymEvening']);

// --- When / Condition / Schedule -------------------------------------------------------------

export const conditionSchema = z
  .strictObject({
    days: z.array(weekdaySchema).min(1).optional(),
    flag: z.string().min(1).optional(),
    flagValue: z.boolean().optional(),
  })
  // An empty condition would match every day, which is almost certainly a mistake.
  .refine((condition) => condition.days !== undefined || condition.flag !== undefined, {
    message: CUSTOM_CODES.condition,
  })
  .refine((condition) => condition.flagValue === undefined || condition.flag !== undefined, {
    message: CUSTOM_CODES.flagValue,
  });

/** A list means "applies if ANY condition matches". */
export const whenSchema = z.union([conditionSchema, z.array(conditionSchema).min(1)]);

export const scheduleSchema = z
  .object({
    days: z.array(weekdaySchema).min(1),
    time: timeSchema.optional(),
    relativeTo: anchorNameSchema.optional(),
    offsetMin: z.number().int().optional(),
    repeatEveryMin: positiveInt.optional(),
    until: timeSchema.optional(),
  })
  .refine((schedule) => schedule.time !== undefined || schedule.relativeTo !== undefined, {
    message: CUSTOM_CODES.schedule,
  });

// --- Steps -----------------------------------------------------------------------------------

const stepBase = {
  id: idSchema,
  name: nameSchema,
  how: freeTextSchema.optional(),
  muscles: z.array(z.string().min(1)).optional(),
  when: whenSchema.optional(),
};

export const checkStepSchema = z.strictObject({ type: z.literal('check'), ...stepBase });

export const waitStepSchema = z.strictObject({
  type: z.literal('wait'),
  ...stepBase,
  waitSec: positiveInt,
  waitReason: freeTextSchema.optional(),
});

export const setsStepSchema = z
  .strictObject({
  type: z.literal('sets'),
  ...stepBase,
  sets: positiveInt,
  /** Free text such as "8–10" or "10–12 por pierna"; parsed by the domain layer. */
  reps: localizedTextSchema(1),
  restSec: nonNegativeInt,
  weightHint: freeTextSchema.optional(),
  approach: freeTextSchema.optional(),
  bodyweight: z.boolean().optional(),
  holdSec: positiveInt.optional(),
  incrementKg: z.number().positive().optional(),
})
  // Reps are numbers first: every language version must mean the same range, or the targets
  // (parsed from the Spanish text) would disagree with what an English reader sees.
  .superRefine((step, ctx) => {
    if (typeof step.reps === 'string' || step.reps.en === undefined) return;
    if (JSON.stringify(parseReps(step.reps.en)) !== JSON.stringify(parseReps(step.reps.es))) {
      ctx.addIssue({ code: 'custom', message: CUSTOM_CODES.repsLanguages, path: ['reps', 'en'] });
    }
  });

export const timedStepSchema = z.strictObject({
  type: z.literal('timed'),
  ...stepBase,
  totalSec: positiveInt,
  segments: z.array(z.strictObject({ atSec: nonNegativeInt, label: localizedTextSchema(1) })),
});

export const counterStepSchema = z.strictObject({
  type: z.literal('counter'),
  ...stepBase,
  target: positiveInt,
  unit: freeTextSchema.optional(),
});

export const stepSchema = z.discriminatedUnion('type', [
  checkStepSchema,
  waitStepSchema,
  setsStepSchema,
  timedStepSchema,
  counterStepSchema,
]);

// --- Programs --------------------------------------------------------------------------------

export const programRulesSchema = z.strictObject({
  progression: z.enum(['double']),
  /** Reps-in-reserve target range, e.g. [1, 2]. */
  rirTarget: z.tuple([z.number().int().min(0).max(5), z.number().int().min(0).max(5)]),
  stallSessions: positiveInt,
  deloadPct: z.number().min(0).max(100),
});

const routineSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  steps: z.array(stepSchema).min(1),
});

/** Reports each repeated id in `items`, pointing at `path(index)`. */
function addDuplicateIssues(
  ctx: z.RefinementCtx,
  ids: readonly string[],
  path: (index: number) => (string | number)[],
): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) ctx.addIssue({ code: 'custom', message: CUSTOM_CODES.duplicateId, path: path(index) });
    seen.add(id);
  });
}

export const programSchema = z
  .strictObject({
    id: idSchema,
    name: nameSchema,
    rotation: z.boolean().default(true),
    schedules: z.array(scheduleSchema).optional(),
    rules: programRulesSchema.optional(),
    routines: z
      .array(routineSchema)
      .min(1)
      .refine(
        (routines) => new Set(routines.map((routine) => routine.id)).size === routines.length,
        { message: CUSTOM_CODES.duplicateId },
      ),
  })
  // The step id is the exercise history key and set logs are unique per (session, step, set), so a
  // step id may not repeat inside one routine. The SAME id across routines is deliberate: it shares
  // history between routines (e.g. a common warm-up or the same lift on two days).
  .superRefine((program, ctx) => {
    program.routines.forEach((routine, routineIndex) =>
      addDuplicateIssues(
        ctx,
        routine.steps.map((step) => step.id),
        (index) => ['routines', routineIndex, 'steps', index, 'id'],
      ),
    );
  });

// --- Habits, reminders, metrics, check-ins, notes -------------------------------------------

export const habitTargetSchema = z.union([
  positiveInt,
  z.strictObject({ formula: z.enum(['water', 'steps']) }),
]);

const habitBase = {
  id: idSchema,
  name: nameSchema,
  how: freeTextSchema.optional(),
  schedules: z.array(scheduleSchema).optional(),
  notification: z
    .object({
      title: localizedTextSchema(1),
      body: localizedTextSchema(1),
      action: freeTextSchema.optional(),
    })
    .optional(),
  /** Profile conditions, e.g. `{ "profile.workType": "sentada" }`. */
  onlyIf: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
};

export const habitSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('check'), ...habitBase }),
  z.strictObject({
    type: z.literal('counter'),
    ...habitBase,
    unit: freeTextSchema.optional(),
    glassMl: positiveInt.optional(),
    source: z.enum(['manual', 'health_connect', 'health_connect_or_manual']).optional(),
    target: habitTargetSchema.optional(),
  }),
]);

export const reminderSchema = z.strictObject({
  id: idSchema,
  text: localizedTextSchema(1),
  schedule: scheduleSchema,
});

export const metricSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  unit: localizedTextSchema(1),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
});

export const photosSchema = z.strictObject({
  frequency: z.enum(['weekly', 'monthly']),
  /** `{ id, label }` (stable id stored with each photo) or a legacy text (its Spanish is the id). */
  poses: z
    .array(
      z.union([
        localizedTextSchema(1),
        z.strictObject({ id: idSchema, label: localizedTextSchema(1) }),
      ]),
    )
    .min(1),
  guide: freeTextSchema.optional(),
});

const questionBase = { id: idSchema, label: localizedTextSchema(1), optional: z.boolean().optional() };

export const checkinQuestionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('time'),
    ...questionBase,
    prefill: z.enum(['bed', 'wake']).optional(),
  }),
  z.strictObject({
    type: z.literal('scale'),
    ...questionBase,
    scale: z
      .tuple([z.number().int(), z.number().int()])
      .refine(([min, max]) => min < max, { message: CUSTOM_CODES.scale }),
  }),
  z.strictObject({ type: z.literal('text'), ...questionBase }),
]);

export const checkinsSchema = z.strictObject({
  morning: z.array(checkinQuestionSchema).optional(),
  night: z.array(checkinQuestionSchema).optional(),
  monthly: z.array(checkinQuestionSchema).optional(),
});

export const notesSchema = z.strictObject({
  prompt: localizedTextSchema(1),
  optional: z.boolean().optional(),
});

// --- Modules ---------------------------------------------------------------------------------

type ModuleIdContent = {
  habits?: readonly { id: string }[] | undefined;
};

function refineModule(module: ModuleIdContent, ctx: z.RefinementCtx): void {
  addDuplicateIssues(
    ctx,
    (module.habits ?? []).map((habit) => habit.id),
    (index) => ['habits', index, 'id'],
  );
}

const moduleBody = {
  id: idSchema,
  name: nameSchema,
  icon: iconSchema,
  programs: z.array(programSchema).optional(),
  habits: z.array(habitSchema).optional(),
  reminders: z.array(reminderSchema).optional(),
  metrics: z.array(metricSchema).optional(),
  photos: photosSchema.optional(),
  checkins: checkinsSchema.optional(),
  notes: notesSchema.optional(),
};

/** A module without the file envelope (`schemaVersion`/`kind`), as stored inside bundles. */
export const moduleBodySchema = z.strictObject(moduleBody).superRefine(refineModule);

export const moduleTemplateSchema = z
  .strictObject({
    schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
    kind: z.literal('module'),
    ...moduleBody,
  })
  .superRefine(refineModule);

export const modulesTemplateSchema = z
  .strictObject({
    schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
    kind: z.literal('modules'),
    modules: z.array(moduleBodySchema).min(1),
  })
  .superRefine((bundle, ctx) =>
    addDuplicateIssues(
      ctx,
      bundle.modules.map((module) => module.id),
      (index) => ['modules', index, 'id'],
    ),
  );

// --- Settings --------------------------------------------------------------------------------

export const themeModeSchema = z.enum(['system', 'light', 'dark']);
export const languageSchema = z.enum(['es', 'en']);

export const profileDataSchema = z.strictObject({
  weightKg: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  ageYears: positiveInt.optional(),
  workType: z.string().min(1).optional(),
  goal: z.string().min(1).optional(),
  level: z.string().min(1).optional(),
});

export const anchorsSchema = z.strictObject({
  wake: timeSchema.optional(),
  sleepTargetH: z.number().positive().max(24).optional(),
  gymMorning: timeSchema.optional(),
  gymEvening: timeSchema.optional(),
});

export const gymDaysSchema = z.array(
  z.strictObject({
    days: z.array(weekdaySchema).min(1),
    anchor: z.enum(['gymMorning', 'gymEvening']),
  }),
);

/** One gym day with its approximate time (`HH:mm`): the per-day model behind Ajustes > "Horarios y gym". */
export const gymPlanSchema = z.array(z.strictObject({ weekday: weekdaySchema, time: timeSchema }));

export const checkinPrefsSchema = z.strictObject({
  morning: z.boolean(),
  night: z.boolean(),
  monthlyReviewDay: z.number().int().min(1).max(28),
});

export const settingsTemplateSchema = z.strictObject({
  schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
  kind: z.literal('settings'),
  language: languageSchema.optional(),
  theme: z.strictObject({ mode: themeModeSchema.optional() }).optional(),
  profile: profileDataSchema.optional(),
  anchors: anchorsSchema.optional(),
  gymDays: gymDaysSchema.optional(),
  checkins: checkinPrefsSchema.optional(),
});

/** The single kind -> schema mapping: the importer dispatches on it and `Template` derives from it. */
export const KIND_SCHEMAS = {
  module: moduleTemplateSchema,
  modules: modulesTemplateSchema,
  settings: settingsTemplateSchema,
} as const;

// --- Types -----------------------------------------------------------------------------------

export type Step = z.infer<typeof stepSchema>;
export type When = z.infer<typeof whenSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type Program = z.infer<typeof programSchema>;
export type Habit = z.infer<typeof habitSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type Metric = z.infer<typeof metricSchema>;
export type CheckinQuestion = z.infer<typeof checkinQuestionSchema>;
export type ModuleBody = z.infer<typeof moduleBodySchema>;
export type ModuleTemplate = z.infer<typeof moduleTemplateSchema>;
export type ModulesTemplate = z.infer<typeof modulesTemplateSchema>;
export type SettingsTemplate = z.infer<typeof settingsTemplateSchema>;
export type TemplateKind = keyof typeof KIND_SCHEMAS;
export type Template = { [K in TemplateKind]: z.infer<(typeof KIND_SCHEMAS)[K]> }[TemplateKind];
export type ThemeModeSetting = z.infer<typeof themeModeSchema>;
export type LanguageSetting = z.infer<typeof languageSchema>;
export type ProfileData = z.infer<typeof profileDataSchema>;
export type Anchors = z.infer<typeof anchorsSchema>;
export type GymDays = z.infer<typeof gymDaysSchema>;
export type GymPlan = z.infer<typeof gymPlanSchema>;
export type CheckinPrefs = z.infer<typeof checkinPrefsSchema>;

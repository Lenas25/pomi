import { z } from 'zod';

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
} as const;

const idSchema = z.string().min(1);
const nameSchema = z.string().min(1);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, CUSTOM_CODES.time);
const weekdaySchema = z.number().int().min(0).max(6);
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();

/** Phosphor icon component name, e.g. `Barbell`. Emoji and free text are rejected. */
export const iconSchema = z.string().regex(/^[A-Z][A-Za-z0-9]*$/, CUSTOM_CODES.icon);

export const anchorNameSchema = z.enum(['wake', 'bed', 'gymMorning', 'gymEvening']);

// --- When / Condition / Schedule -------------------------------------------------------------

export const conditionSchema = z.strictObject({
  days: z.array(weekdaySchema).optional(),
  flag: z.string().min(1).optional(),
  flagValue: z.boolean().optional(),
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
  how: z.string().optional(),
  muscles: z.array(z.string().min(1)).optional(),
  when: whenSchema.optional(),
};

export const checkStepSchema = z.strictObject({ type: z.literal('check'), ...stepBase });

export const waitStepSchema = z.strictObject({
  type: z.literal('wait'),
  ...stepBase,
  waitSec: positiveInt,
  waitReason: z.string().optional(),
});

export const setsStepSchema = z.strictObject({
  type: z.literal('sets'),
  ...stepBase,
  sets: positiveInt,
  /** Free text such as "8–10" or "10–12 por pierna"; parsed by the domain layer. */
  reps: z.string().min(1),
  restSec: nonNegativeInt,
  weightHint: z.string().optional(),
  approach: z.string().optional(),
  bodyweight: z.boolean().optional(),
  holdSec: positiveInt.optional(),
  incrementKg: z.number().positive().optional(),
});

export const timedStepSchema = z.strictObject({
  type: z.literal('timed'),
  ...stepBase,
  totalSec: positiveInt,
  segments: z.array(z.strictObject({ atSec: nonNegativeInt, label: z.string().min(1) })),
});

export const counterStepSchema = z.strictObject({
  type: z.literal('counter'),
  ...stepBase,
  target: positiveInt,
  unit: z.string().optional(),
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

export const programSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  rotation: z.boolean().default(true),
  schedules: z.array(scheduleSchema).optional(),
  rules: programRulesSchema.optional(),
  routines: z
    .array(routineSchema)
    .min(1)
    .refine((routines) => new Set(routines.map((routine) => routine.id)).size === routines.length, {
      message: CUSTOM_CODES.duplicateId,
    }),
});

// --- Habits, reminders, metrics, check-ins, notes -------------------------------------------

export const habitTargetSchema = z.union([
  positiveInt,
  z.strictObject({ formula: z.enum(['water', 'steps']) }),
]);

const habitBase = {
  id: idSchema,
  name: nameSchema,
  how: z.string().optional(),
  schedules: z.array(scheduleSchema).optional(),
  notification: z
    .object({
      title: z.string().min(1),
      body: z.string().min(1),
      action: z.string().optional(),
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
    unit: z.string().optional(),
    glassMl: positiveInt.optional(),
    source: z.enum(['manual', 'health_connect', 'health_connect_or_manual']).optional(),
    target: habitTargetSchema.optional(),
  }),
]);

export const reminderSchema = z.strictObject({
  id: idSchema,
  text: z.string().min(1),
  schedule: scheduleSchema,
});

export const metricSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  unit: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
});

export const photosSchema = z.strictObject({
  frequency: z.enum(['weekly', 'monthly']),
  poses: z.array(z.string().min(1)).min(1),
  guide: z.string().optional(),
});

const questionBase = { id: idSchema, label: z.string().min(1), optional: z.boolean().optional() };

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
  prompt: z.string().min(1),
  optional: z.boolean().optional(),
});

// --- Modules ---------------------------------------------------------------------------------

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
export const moduleBodySchema = z.strictObject(moduleBody);

export const moduleTemplateSchema = z.strictObject({
  schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
  kind: z.literal('module'),
  ...moduleBody,
});

export const modulesTemplateSchema = z.strictObject({
  schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
  kind: z.literal('modules'),
  modules: z.array(moduleBodySchema).min(1),
});

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

export const templateSchema = z.discriminatedUnion('kind', [
  moduleTemplateSchema,
  modulesTemplateSchema,
  settingsTemplateSchema,
]);

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
export type Template = z.infer<typeof templateSchema>;
export type ThemeModeSetting = z.infer<typeof themeModeSchema>;
export type LanguageSetting = z.infer<typeof languageSchema>;
export type ProfileData = z.infer<typeof profileDataSchema>;
export type Anchors = z.infer<typeof anchorsSchema>;
export type GymDays = z.infer<typeof gymDaysSchema>;
export type CheckinPrefs = z.infer<typeof checkinPrefsSchema>;

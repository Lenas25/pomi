import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  anchorsSchema,
  checkinPrefsSchema,
  gymDaysSchema,
  gymPlanSchema,
  languageSchema,
  themeModeSchema,
  timeSchema,
} from '../../templates/schema';
import { BED_SHIFT_LIMIT_MIN, WATER_SHIFT_LIMIT_MIN } from '../../domain/suggestions/limits';
import { dayKeyFor } from '../../domain/time';
import { isIsoMonday } from '../../domain/gym/gymPlan';
import {
  CHECKIN_OFFSET_MAX,
  EVERY_MIN_MAX,
  EVERY_MIN_MIN,
  GYM_BEFORE_MAX,
  MAX_QUIET_WINDOWS,
  SCREENS_OFF_BEFORE_MAX,
} from '../../domain/notifications/prefs';
import { settings } from '../schema';
import type { Db } from '../types';

/** Goals accepted on the onboarding summary ("Tu punto de partida"); editable later in Settings. */
export const goalsSchema = z.strictObject({
  waterGlassesRest: z.number().int().positive().optional(),
  waterGlassesGym: z.number().int().positive().optional(),
  stepsGoal: z.number().int().positive().optional(),
});

const prefWeekdays = z.array(z.number().int().min(0).max(6)).min(1).max(7);
const minutes = (max: number) => z.number().int().min(0).max(max);

/** A repeating category (water, active pause): its window, interval and weekdays. */
const repeatPrefsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  from: timeSchema.optional(),
  until: timeSchema.optional(),
  everyMin: z.number().int().min(EVERY_MIN_MIN).max(EVERY_MIN_MAX).optional(),
  days: prefWeekdays.optional(),
});

const quietWindowSchema = z.strictObject({
  from: timeSchema,
  until: timeSchema,
  days: prefWeekdays,
});

/** User choices for the planned notifications (everything defaults to on / today's behaviour). */
export const notificationPrefsSchema = z.strictObject({
  /** Master switch: off cancels every planned notification. */
  enabled: z.boolean().optional(),
  /** "¿Te moviste hoy?" on/off. */
  survey: z.boolean().optional(),
  /** Fixed time for the survey; default is 90 minutes before bed. */
  surveyTime: timeSchema.optional(),
  weeklyReview: z.boolean().optional(),
  /** Monthly review reminder on/off (default on). */
  monthlyReview: z.boolean().optional(),
  /** Day of the month (1-28, so every month has it) of the monthly review; default 1. */
  monthlyReviewDay: z.number().int().min(1).max(28).optional(),
  /** "Mis avisos" (see `src/domain/notifications/prefs.ts`); a missing field = today's behaviour. */
  water: repeatPrefsSchema.optional(),
  gym: z
    .strictObject({
      enabled: z.boolean().optional(),
      minutesBefore: minutes(GYM_BEFORE_MAX).optional(),
    })
    .optional(),
  morningCheckin: z
    .strictObject({
      enabled: z.boolean().optional(),
      offsetAfterWakeMin: minutes(CHECKIN_OFFSET_MAX).optional(),
    })
    .optional(),
  nightCheckin: z
    .strictObject({
      enabled: z.boolean().optional(),
      offsetBeforeBedMin: minutes(CHECKIN_OFFSET_MAX).optional(),
    })
    .optional(),
  bedtime: z.strictObject({ enabled: z.boolean().optional() }).optional(),
  screensOff: z
    .strictObject({
      enabled: z.boolean().optional(),
      minutesBefore: minutes(SCREENS_OFF_BEFORE_MAX).optional(),
    })
    .optional(),
  activePause: repeatPrefsSchema.optional(),
  quietHours: z.array(quietWindowSchema).max(MAX_QUIET_WINDOWS).optional(),
});

/** What the person did to the timeline of ONE day (`date`); a different day means a clean slate. */
export const todayStateSchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** "Omitir hoy". */
  skipped: z.array(z.string()),
  /** Items without real data behind them (reminders) that were acknowledged by hand. */
  acked: z.array(z.string()),
  /** "Posponer 10 min": agenda item id -> epoch ms it is postponed to. */
  snoozed: z.record(z.string(), z.number()),
});

/**
 * Plan adjustments the person accepted from a suggestion. Minutes are negative (EARLIER): the
 * planned bedtime moves before `wake − sleepTargetH`, the water reminders move before the template
 * schedule. Capped so a chain of suggestions can never drift far from the original plan.
 */
export const planShiftsSchema = z.strictObject({
  bedMin: z.number().int().min(BED_SHIFT_LIMIT_MIN).max(0).optional(),
  waterMin: z.number().int().min(WATER_SHIFT_LIMIT_MIN).max(0).optional(),
});

/** An accepted "semana de descarga": every working weight is lowered by `pct` until `endsOn`. */
export const deloadWeekSchema = z.strictObject({
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pct: z.number().int().min(5).max(20),
});

/** The sedentary nudge (PLAN §14b); every field defaults in `DEFAULT_SEDENTARY`. */
export const sedentaryNudgeSchema = z.strictObject({
  enabled: z.boolean().optional(),
  windowMin: z.union([z.literal(60), z.literal(90), z.literal(120)]).optional(),
  threshold: z.number().int().min(20).max(500).optional(),
  days: z.array(z.number().int().min(0).max(6)).optional(),
  maxPerDay: z.number().int().min(1).max(5).optional(),
  noPhone: z.boolean().optional(),
});

/** Nudges sent so far (per logical day) and the last one, for the cap and the cooldown. */
export const sedentaryHistorySchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().min(0),
  lastAt: z.number().optional(),
});

/** Every key the app stores, with the shape of its value. Values are validated on read. */
export const settingsSchemas = {
  anchors: anchorsSchema,
  gymDays: gymDaysSchema,
  /** Per-day gym times; when absent the plan is derived from `gymDays` + anchors (`effectiveGymPlan`). */
  gymPlan: gymPlanSchema,
  /**
   * One-week overrides of the usual plan from the weekly review, keyed by the Monday of their ISO
   * week (`effectiveGymPlan(settings, date)`); old weeks are pruned on write.
   */
  gymWeekPlans: z.record(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isIsoMonday, { message: 'week key must be a Monday' }),
    gymPlanSchema,
  ),
  /** Weekdays (0 = Sunday) the person usually has free: the "free days" of social jetlag and "Tu ritmo". */
  freeDays: z.array(z.number().int().min(0).max(6)),
  themeMode: themeModeSchema,
  language: languageSchema,
  activeModules: z.array(z.string()),
  checkinPrefs: checkinPrefsSchema,
  templatesSeeded: z.boolean(),
  onboardingComplete: z.boolean(),
  userName: z.string().min(1),
  /** Rough "steps per day" answer from the onboarding, the baseline until real data exists. */
  stepsEstimate: z.number().nonnegative(),
  goals: goalsSchema,
  /** Day (`yyyy-MM-dd`) the person finished the onboarding: the start of the step baseline week. */
  startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notificationPrefs: notificationPrefsSchema,
  todayState: todayStateSchema,
  planShifts: planShiftsSchema,
  deloadWeek: deloadWeekSchema,
  /** Last day (`yyyy-MM-dd`) the suggestions engine ran (it runs once per day). */
  suggestionsLastRun: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Monday (`yyyy-MM-dd`) of the ISO week the insights engine last ran (it runs once per week). */
  insightsLastRun: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Day the gym plan (`gymDays`) last changed: accepted suggestion, onboarding or a manual edit. */
  gymDaysChangedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Day the steps goal (`goals.stepsGoal`) last changed, whichever way it changed. */
  goalsChangedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Day a water goal (`goals.waterGlassesRest/Gym`) last changed; never pauses the steps rule. */
  waterGoalChangedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Gentle "export your backup" line in the monthly review (default on). */
  backupReminder: z.boolean(),
  sedentaryNudge: sedentaryNudgeSchema,
  sedentaryHistory: sedentaryHistorySchema,
  /** The background job found a revoked Health Connect permission and turned the nudge off; shown once. */
  sedentaryPermissionLost: z.boolean(),
  /** Epoch ms of the last heavy background run (suggestions + notification sync, at most every ~6 h). */
  backgroundLastHeavyRunAt: z.number().nonnegative(),
  /** Stamp rewinds spent after failed heavy runs in the current ~6 h window (caps the retries). */
  backgroundHeavyRetries: z.strictObject({
    windowStart: z.number().nonnegative(),
    count: z.number().int().nonnegative(),
  }),
  /** Interval (minutes) the periodic job was last registered with; re-registering resets its period. */
  backgroundIntervalMin: z.number().int().positive(),
  /** Day the person put away the one companion card of Hoy ("Tu ritmo"); it stays away that day. */
  companionCardDismissed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Last notification responses already applied (dedupes the background task vs the listener). */
  handledNotificationResponses: z.array(z.string()),
  /** The person opened the system screen for exact alarms / battery (Android gives no way to read them). */
  permissionHints: z.strictObject({
    alarms: z.boolean().optional(),
    battery: z.boolean().optional(),
  }),
} as const;

export type SettingsKey = keyof typeof settingsSchemas;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof settingsSchemas)[K]>;

let savepointCounter = 0;
/** Per-Db promise chain: concurrent `set` calls (savepoints share one connection) never interleave. */
const setLocks = new WeakMap<object, Promise<unknown>>();

const HANDLED_KEY = 'handledNotificationResponses';
/** Handled notification responses kept for dedupe. */
const HANDLED_LIMIT = 40;

export function createSettingsRepository(db: Db, now: () => number = Date.now) {
  async function readRaw(key: SettingsKey): Promise<string | undefined> {
    const rows = await db.select().from(settings).where(eq(settings.key, key));
    return rows[0]?.value;
  }

  async function write(key: SettingsKey, json: string): Promise<void> {
    await db
      .insert(settings)
      .values({ key, value: json })
      .onConflictDoUpdate({ target: settings.key, set: { value: json } });
  }

  /**
   * The planned WEEKDAYS of a `gymDays` / `gymPlan` value as a canonical string (sorted, unique).
   * Only a different weekday set stamps `gymDaysChangedOn`: moving a session's time (or slot) keeps
   * the week comparable for the suggestions engine.
   */
  function plannedWeekdaysOf(
    key: 'gymDays' | 'gymPlan',
    json: string | undefined,
  ): string | undefined {
    if (json === undefined) return undefined;
    try {
      const raw: unknown = JSON.parse(json);
      let days: number[];
      if (key === 'gymDays') {
        const parsed = gymDaysSchema.safeParse(raw);
        if (!parsed.success) return json;
        days = parsed.data.flatMap((entry) => entry.days);
      } else {
        const parsed = gymPlanSchema.safeParse(raw);
        if (!parsed.success) return json;
        days = parsed.data.map((entry) => entry.weekday);
      }
      return JSON.stringify([...new Set(days)].sort((x, y) => x - y));
    } catch {
      return json;
    }
  }

  function trackedGoalsOf(json: string | undefined, part: 'steps' | 'water'): string | undefined {
    // A missing value is "no goals": adding only a water goal must not stamp the steps.
    const text = json ?? '{}';
    try {
      const parsed = goalsSchema.safeParse(JSON.parse(text));
      if (!parsed.success) return undefined;
      const { stepsGoal, waterGlassesRest, waterGlassesGym } = parsed.data;
      return JSON.stringify(
        part === 'steps'
          ? [stepsGoal ?? null]
          : [waterGlassesRest ?? null, waterGlassesGym ?? null],
      );
    } catch {
      return undefined;
    }
  }

  async function setUnlocked<K extends SettingsKey>(
    key: K,
    value: SettingsValue<K>,
  ): Promise<void> {
    const json = JSON.stringify(value);
    if (key !== 'gymDays' && key !== 'gymPlan' && key !== 'goals') {
      await write(key, json);
      return;
    }
    // Value and stamp are ONE unit: a savepoint works at the top level (it opens the
    // transaction) and nested inside the caller's transaction (it only rolls back its part).
    const savepoint = `settings_set_${(savepointCounter += 1)}`;
    await db.run(sql.raw(`savepoint ${savepoint}`));
    let released = false;
    try {
      const before = await readRaw(key);
      await write(key, json);
      const today = dayKeyFor(new Date(now()));
      if (
        (key === 'gymDays' || key === 'gymPlan') &&
        plannedWeekdaysOf(key, before) !== plannedWeekdaysOf(key, json)
      ) {
        await write('gymDaysChangedOn', JSON.stringify(today));
      }
      if (key === 'goals' && trackedGoalsOf(before, 'steps') !== trackedGoalsOf(json, 'steps')) {
        await write('goalsChangedOn', JSON.stringify(today));
      }
      if (key === 'goals' && trackedGoalsOf(before, 'water') !== trackedGoalsOf(json, 'water')) {
        await write('waterGoalChangedOn', JSON.stringify(today));
      }
      await db.run(sql.raw(`release savepoint ${savepoint}`));
      released = true;
    } catch (error) {
      // After a successful release the savepoint no longer exists: nothing to roll back.
      if (released) throw error;
      try {
        await db.run(sql.raw(`rollback to savepoint ${savepoint}`));
        await db.run(sql.raw(`release savepoint ${savepoint}`));
      } catch {
        // Keep the original failure.
      }
      throw error;
    }
  }

  async function get<K extends SettingsKey>(key: K): Promise<SettingsValue<K> | undefined> {
    const rows = await db.select().from(settings).where(eq(settings.key, key));
    const row = rows[0];
    if (!row) return undefined;
    try {
      const parsed = settingsSchemas[key].safeParse(JSON.parse(row.value));
      return parsed.success ? (parsed.data as SettingsValue<K>) : undefined;
    } catch {
      return undefined;
    }
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const previous = setLocks.get(db) ?? Promise.resolve();
    const run = previous.then(task, task);
    setLocks.set(
      db,
      run.catch(() => undefined),
    );
    return run;
  }

  return {
    /** Returns `undefined` when the key is missing or its stored value no longer matches the schema. */
    get,

    /**
     * Writes a value. Two plan keys also stamp WHEN they changed, whoever changed them
     * (accepted suggestion, onboarding, a manual edit): `gymDays` -> `gymDaysChangedOn`, a
     * different steps goal -> `goalsChangedOn` and a different water goal -> `waterGoalChangedOn`. The suggestions engine reads the stamps so
     * it never judges a new plan by the old one.
     */
    set<K extends SettingsKey>(key: K, value: SettingsValue<K>): Promise<void> {
      return enqueue(() => setUnlocked(key, value));
    },

    /**
     * Read-modify-write of one key inside the settings mutex, so two fast callers never lose an
     * update. `fn` receives the stored value (or `undefined`) and returns the next one. Same
     * limitation as `set`: the mutex does not cover a caller's `withTransaction` (see CLAUDE.md).
     */
    update<K extends SettingsKey>(
      key: K,
      fn: (current: SettingsValue<K> | undefined) => SettingsValue<K>,
    ): Promise<SettingsValue<K>> {
      return enqueue(async () => {
        const next = fn(await get(key));
        await setUnlocked(key, next);
        return next;
      });
    },

    /**
     * Claims a notification response for exactly one handler: a SINGLE upsert-if-absent statement
     * (no read-then-write window between the background task and the foreground listener).
     * Returns `false` when the key was already claimed. Bounded to the last `HANDLED_LIMIT` keys.
     */
    async claimNotificationResponse(responseKey: string): Promise<boolean> {
      const rows = await db
        .insert(settings)
        .values({ key: HANDLED_KEY, value: JSON.stringify([responseKey]) })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: sql`json_insert(settings.value, '$[#]', ${responseKey})` },
          setWhere: sql`NOT EXISTS (SELECT 1 FROM json_each(settings.value) AS handled WHERE handled.value = ${responseKey})`,
        })
        .returning({ key: settings.key });
      if (rows.length === 0) return false;
      await db
        .update(settings)
        .set({
          value: sql`(SELECT json_group_array(handled.value) FROM json_each(settings.value) AS handled WHERE handled.key >= json_array_length(settings.value) - ${HANDLED_LIMIT})`,
        })
        .where(
          and(
            eq(settings.key, HANDLED_KEY),
            sql`json_array_length(settings.value) > ${HANDLED_LIMIT}`,
          ),
        );
      return true;
    },

    /** Undoes `claimNotificationResponse` (the action failed, so a retry must be able to run). */
    async releaseNotificationResponse(responseKey: string): Promise<void> {
      await db
        .update(settings)
        .set({
          value: sql`(SELECT json_group_array(handled.value) FROM json_each(settings.value) AS handled WHERE handled.value <> ${responseKey})`,
        })
        .where(eq(settings.key, HANDLED_KEY));
    },

    async remove(key: SettingsKey): Promise<void> {
      await db.delete(settings).where(eq(settings.key, key));
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;

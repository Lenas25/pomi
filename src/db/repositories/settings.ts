import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  anchorsSchema,
  checkinPrefsSchema,
  gymDaysSchema,
  languageSchema,
  themeModeSchema,
  timeSchema,
} from '../../templates/schema';
import { settings } from '../schema';
import type { Db } from '../types';

/** Goals accepted on the onboarding summary ("Tu punto de partida"); editable later in Settings. */
export const goalsSchema = z.strictObject({
  waterGlassesRest: z.number().int().positive().optional(),
  waterGlassesGym: z.number().int().positive().optional(),
  stepsGoal: z.number().int().positive().optional(),
});

/** User choices for the planned notifications (everything defaults to on). */
export const notificationPrefsSchema = z.strictObject({
  /** Master switch: off cancels every planned notification. */
  enabled: z.boolean().optional(),
  /** "¿Te moviste hoy?" on/off. */
  survey: z.boolean().optional(),
  /** Fixed time for the survey; default is 90 minutes before bed. */
  surveyTime: timeSchema.optional(),
  weeklyReview: z.boolean().optional(),
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

/** Every key the app stores, with the shape of its value. Values are validated on read. */
export const settingsSchemas = {
  anchors: anchorsSchema,
  gymDays: gymDaysSchema,
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

const HANDLED_KEY = 'handledNotificationResponses';
/** Handled notification responses kept for dedupe. */
const HANDLED_LIMIT = 40;

export function createSettingsRepository(db: Db) {
  return {
    /** Returns `undefined` when the key is missing or its stored value no longer matches the schema. */
    async get<K extends SettingsKey>(key: K): Promise<SettingsValue<K> | undefined> {
      const rows = await db.select().from(settings).where(eq(settings.key, key));
      const row = rows[0];
      if (!row) return undefined;
      try {
        const parsed = settingsSchemas[key].safeParse(JSON.parse(row.value));
        return parsed.success ? (parsed.data as SettingsValue<K>) : undefined;
      } catch {
        return undefined;
      }
    },

    async set<K extends SettingsKey>(key: K, value: SettingsValue<K>): Promise<void> {
      const json = JSON.stringify(value);
      await db
        .insert(settings)
        .values({ key, value: json })
        .onConflictDoUpdate({ target: settings.key, set: { value: json } });
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

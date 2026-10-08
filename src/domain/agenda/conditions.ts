// Evaluation of template conditions: `When` (steps) and `onlyIf` (habits).
import type { When } from '../../templates/schema';

export type ConditionContext = {
  /** 0 = Sunday ... 6 = Saturday (date-fns `getDay`). */
  weekday: number;
  /** Boolean flags such as `deload`; a missing flag counts as `false`. */
  flags?: Readonly<Record<string, boolean>>;
};

/**
 * A single condition holds when EVERY field it declares holds (`days` AND `flag`).
 * A list of conditions holds when ANY of them does. An empty condition (`{}`) and an empty list
 * (`[]`) mean "no constraint" and always hold. The template schema rejects both (`min(1)`), so this
 * only matters for hand-built input; a step must not silently vanish because of an empty list.
 */
export function evaluateWhen(when: When | undefined, context: ConditionContext): boolean {
  if (when === undefined) return true;
  const conditions = Array.isArray(when) ? when : [when];
  if (conditions.length === 0) return true;
  return conditions.some((condition) => {
    if (condition.days !== undefined && !condition.days.includes(context.weekday)) return false;
    if (condition.flag !== undefined) {
      const actual = context.flags?.[condition.flag] ?? false;
      if (actual !== (condition.flagValue ?? true)) return false;
    }
    return true;
  });
}

export type Profile = Readonly<Record<string, string | number | boolean | undefined>>;

/**
 * `onlyIf` keys are `profile.<field>` paths; every entry must equal the profile value.
 * An unknown namespace or a missing profile value fails the condition.
 */
export function evaluateOnlyIf(
  onlyIf: Readonly<Record<string, string | number | boolean>> | undefined,
  profile: Profile,
): boolean {
  if (onlyIf === undefined) return true;
  return Object.entries(onlyIf).every(([path, expected]) => {
    const [namespace, field] = path.split('.');
    if (namespace !== 'profile' || field === undefined) return false;
    return profile[field] === expected;
  });
}

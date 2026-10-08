import { View } from 'react-native';

import { useT } from '../i18n';

import { Chip } from './Chip';
import { useTheme } from './theme';

/** Monday first; values are `getDay` numbers (0 = Sunday). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const SHORT = [
  'weekdays.short.d0',
  'weekdays.short.d1',
  'weekdays.short.d2',
  'weekdays.short.d3',
  'weekdays.short.d4',
  'weekdays.short.d5',
  'weekdays.short.d6',
] as const;
const LONG = [
  'weekdays.long.d0',
  'weekdays.long.d1',
  'weekdays.long.d2',
  'weekdays.long.d3',
  'weekdays.long.d4',
  'weekdays.long.d5',
  'weekdays.long.d6',
] as const;

type WeekdayChipsProps = {
  selected: readonly number[];
  onChange: (days: number[]) => void;
  accessibilityLabel: string;
};

/** A weekday multi-select (Monday first). Emits the new selection sorted, Sunday = 0. */
export function WeekdayChips({ selected, onChange, accessibilityLabel }: WeekdayChipsProps) {
  const t = useT();
  const theme = useTheme();
  const toggle = (day: number) => {
    const next = selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day];
    onChange(next.sort((a, b) => a - b));
  };
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}
    >
      {WEEK_ORDER.map((day) => (
        <Chip
          key={day}
          label={t(SHORT[day] ?? SHORT[0])}
          accessibilityLabel={t(LONG[day] ?? LONG[0])}
          selected={selected.includes(day)}
          onPress={() => toggle(day)}
        />
      ))}
    </View>
  );
}

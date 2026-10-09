import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useT } from '../i18n';
import {
  formatClock,
  progress,
  remainingSec,
  type TimerSegment,
  type TimerState,
  currentSegment,
  elapsedSec,
} from '../timers/timerModel';

import { useTheme } from './theme';

export type TimerRingKind = 'rest' | 'wait' | 'cardio';

type TimerRingProps = {
  kind: TimerRingKind;
  state: TimerState;
  /** Epoch ms used to derive the remaining time; the parent re-renders it while running. */
  now: number;
  /** Cardio: the segments of the block; the current one is shown under the number. */
  segments?: readonly TimerSegment[];
  /** Diameter override (capped by the caller on small screens); defaults to `ring.size`. */
  size?: number;
};

/** Spoken duration, e.g. "1 minuto 20 segundos". */
export function useSpokenDuration(): (totalSec: number) => string {
  const t = useT();
  return (totalSec) => {
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    const parts: string[] = [];
    if (minutes > 0) {
      parts.push(
        t(minutes === 1 ? 'timers.spoken.minuteOne' : 'timers.spoken.minuteOther', {
          count: minutes,
        }),
      );
    }
    if (seconds > 0 || minutes === 0) {
      parts.push(
        t(seconds === 1 ? 'timers.spoken.secondOne' : 'timers.spoken.secondOther', {
          count: seconds,
        }),
      );
    }
    return parts.join(' ');
  };
}

/** Countdown ring (HANDOFF §4): track `border`, progress `energy` (rest) / `brand` (wait, cardio). */
export function TimerRing({ kind, state, now, segments = [], size: sizeProp }: TimerRingProps) {
  const theme = useTheme();
  const t = useT();
  const spoken = useSpokenDuration();
  const size = sizeProp ?? theme.ring.size;
  const stroke = theme.ring.stroke;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const finished = state.status === 'finished';
  const left = remainingSec(state, now);
  const lastSeconds = state.status === 'running' && left >= 1 && left <= 3;
  const segment = segments.length > 0 ? currentSegment(segments, elapsedSec(state, now)) : null;

  const accent = kind === 'rest' ? theme.color.energy : theme.color.brand;
  const ringColor = finished ? theme.color.success : accent;
  const numberColor = finished
    ? theme.color.success
    : lastSeconds
      ? theme.color.energyText
      : theme.color.text;

  const kindName = t(`timers.kind.${kind}`);
  const label = finished
    ? t('timers.finishedLabel', { kind: kindName })
    : t(state.status === 'paused' ? 'timers.pausedLabel' : 'timers.remainingLabel', {
        kind: kindName,
        time: spoken(left),
      });

  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={label}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.color.border}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress(state, now))}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={{ width: size - stroke * 3, alignItems: 'center' }}>
        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[theme.text('timer'), { color: numberColor }]}
        >
          {finished ? t('timers.done') : formatClock(left)}
        </Text>
        {segment ? (
          <Text
            numberOfLines={2}
            style={[theme.text('caption'), { color: theme.color.textMuted, textAlign: 'center' }]}
          >
            {segment.label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

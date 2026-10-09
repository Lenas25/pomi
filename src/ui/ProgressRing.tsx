import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

type ProgressRingProps = {
  /** 0..1 (clamped). */
  progress: number;
  size: number;
  stroke: number;
  color: string;
  trackColor: string;
};

/** Static progress ring (no motion). Decorative: the caller speaks the value in its own label. */
export function ProgressRing({ progress, size, stroke, color, trackColor }: ProgressRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return (
    <View
      testID="progress-ring"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        {value > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - value)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
    </View>
  );
}

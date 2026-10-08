import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { linearScale, niceAxis } from './chartMath';
import { FadeIn } from './FadeIn';
import { useTheme } from './theme';

export type Bar = {
  key: string;
  /** Short x label under the bar. */
  label: string;
  value: number;
  /** Optional goal drawn as an outlined bar behind the value. */
  target?: number;
  /** The period still in progress is drawn in the energy color. */
  current?: boolean;
};

type BarChartProps = {
  bars: readonly Bar[];
  formatY: (y: number) => string;
  /** Spoken description of the whole chart. */
  summary: string;
};

/**
 * Token-styled bar chart on react-native-svg. Used for the weekly consistency: a filled bar per
 * week with the planned amount as an outline behind it, so a shorter bar is simply "less this
 * week", never a failure.
 */
export function BarChart({ bars, formatY, summary }: BarChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const height = theme.chart.height;
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const caption = theme.text('caption');
  const captionSize = caption.fontSize ?? theme.space[3];
  const left = theme.chart.yAxisWidth;
  const right = theme.space[3];
  const top = theme.space[2];
  const bottom = theme.space[6];

  let drawing = null;
  if (width > 0 && bars.length > 0) {
    const highest = Math.max(1, ...bars.map((bar) => Math.max(bar.value, bar.target ?? 0)));
    const axis = niceAxis(0, highest, theme.chart.tickCount);
    const scaleY = linearScale(axis.min, axis.max, height - bottom, top);
    const slot = (width - left - right) / bars.length;
    const barWidth = Math.max(theme.chart.barMinWidth, slot - theme.space[2]);
    const labelProps = {
      fill: theme.color.textMuted,
      fontSize: captionSize,
      fontFamily: caption.fontFamily,
    };
    drawing = (
      <Svg width={width} height={height}>
        {axis.ticks.map((tick) => (
          <Line
            key={tick}
            x1={left}
            x2={width - right}
            y1={scaleY(tick)}
            y2={scaleY(tick)}
            stroke={theme.color.border}
            strokeWidth={theme.stroke.hairline}
          />
        ))}
        {axis.ticks.map((tick) => (
          <SvgText
            key={`label-${tick}`}
            x={left - theme.space[2]}
            y={scaleY(tick) + captionSize / 3}
            textAnchor="end"
            {...labelProps}
          >
            {formatY(tick)}
          </SvgText>
        ))}
        {bars.map((bar, index) => {
          const x = left + index * slot + (slot - barWidth) / 2;
          const base = scaleY(0);
          const valueTop = scaleY(bar.value);
          const targetTop = bar.target === undefined ? undefined : scaleY(bar.target);
          return (
            <G key={bar.key}>
              {targetTop !== undefined ? (
                <Rect
                  x={x}
                  y={targetTop}
                  width={barWidth}
                  height={Math.max(0, base - targetTop)}
                  rx={theme.radius.sm / 2}
                  fill="none"
                  stroke={theme.color.brand}
                  strokeWidth={theme.stroke.hairline}
                />
              ) : null}
              {bar.value > 0 ? (
                <Rect
                  x={x}
                  y={valueTop}
                  width={barWidth}
                  height={Math.max(0, base - valueTop)}
                  rx={theme.radius.sm / 2}
                  fill={bar.current ? theme.color.energy : theme.color.brand}
                />
              ) : null}
              <SvgText
                x={x + barWidth / 2}
                y={height - theme.space[2]}
                textAnchor="middle"
                {...labelProps}
              >
                {bar.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      onLayout={onLayout}
      style={{ height, width: '100%' }}
    >
      <View importantForAccessibility="no-hide-descendants">
        {drawing ? <FadeIn>{drawing}</FadeIn> : null}
      </View>
    </View>
  );
}

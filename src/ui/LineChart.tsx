import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { linePath, linearScale, niceAxis } from './chartMath';
import { FadeIn } from './FadeIn';
import { useTheme } from './theme';

export type LineChartPoint = { x: number; y: number };

type LineChartProps = {
  /** Sorted by x. One point draws a dot, two or more a line. */
  points: readonly LineChartPoint[];
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  /** Spoken description of the whole chart (the drawing itself is hidden from TalkBack). */
  summary: string;
};

/**
 * Token-styled line chart on react-native-svg (no chart dependency). Y axis with round ticks, the
 * first and last x labels, a dot per measurement. Measures its own width, so it works in one or two
 * columns. The chart is ONE accessible image whose label is `summary`.
 */
export function LineChart({ points, formatX, formatY, summary }: LineChartProps) {
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

  const first = points[0];
  const last = points[points.length - 1];
  let drawing = null;
  if (width > 0 && first && last) {
    const ys = points.map((point) => point.y);
    const axis = niceAxis(Math.min(...ys), Math.max(...ys), theme.chart.tickCount);
    const scaleY = linearScale(axis.min, axis.max, height - bottom, top);
    const scaleX = linearScale(first.x, last.x, left, width - right);
    const placed = points.map((point) => ({
      x: points.length === 1 ? (left + width - right) / 2 : scaleX(point.x),
      y: scaleY(point.y),
    }));
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
        <SvgText
          x={placed[0]?.x ?? left}
          y={height - theme.space[2]}
          textAnchor={points.length === 1 ? 'middle' : 'start'}
          {...labelProps}
        >
          {formatX(first.x)}
        </SvgText>
        {points.length > 1 ? (
          <SvgText
            x={placed[placed.length - 1]?.x ?? width - right}
            y={height - theme.space[2]}
            textAnchor="end"
            {...labelProps}
          >
            {formatX(last.x)}
          </SvgText>
        ) : null}
        {points.length > 1 ? (
          <Path
            d={linePath(placed)}
            stroke={theme.color.brand}
            strokeWidth={theme.stroke.accent}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : null}
        {placed.map((point, index) => (
          <Circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={theme.chart.pointRadius}
            fill={index === placed.length - 1 ? theme.color.brand : theme.color.surface}
            stroke={theme.color.brand}
            strokeWidth={theme.stroke.bold}
          />
        ))}
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

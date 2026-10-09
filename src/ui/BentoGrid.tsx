import { useState, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { bentoColumns, packBento, type BentoSpan } from './bentoLayout';
import { useTheme } from './theme';

export type BentoItem = { key: string; span: BentoSpan; node: ReactNode };

type BentoGridProps = { items: readonly BentoItem[] };

/**
 * Responsive bento grid: 2 columns (1 on narrow screens at font scale ≥ 1.3), tiles of
 * 1x1 / 2x1 / 1x2 / 2x2 spans packed in reading order. Row height is `bento.rowHeight` scaled by
 * the font scale, so text keeps fitting; each tile fills its cell (`BentoTile`).
 */
export function BentoGrid({ items }: BentoGridProps) {
  const theme = useTheme();
  const window = useWindowDimensions();
  // Until the first layout, assume the screen column (Screen: max content width, 20 dp margins).
  const [width, setWidth] = useState(
    Math.min(window.width, theme.layout.maxContentWidth) - theme.space[5] * 2,
  );
  const gap = theme.bento.gap;
  const columns = bentoColumns(window.width, window.fontScale, theme.bento);
  const rowHeight = Math.round(theme.bento.rowHeight * Math.max(1, window.fontScale));
  const colWidth = (width - gap * (columns - 1)) / columns;
  const { cells, rows } = packBento(
    items.map((item) => item.span),
    columns,
  );

  return (
    <View
      testID="bento-grid"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ width: '100%', height: rows * rowHeight + Math.max(0, rows - 1) * gap }}
    >
      {items.map((item, index) => {
        const cell = cells[index];
        if (!cell) return null;
        return (
          <View
            key={item.key}
            testID={`bento-cell-${item.key}`}
            style={{
              position: 'absolute',
              left: cell.col * (colWidth + gap),
              top: cell.row * (rowHeight + gap),
              width: cell.colSpan * colWidth + (cell.colSpan - 1) * gap,
              height: cell.rowSpan * rowHeight + (cell.rowSpan - 1) * gap,
            }}
          >
            {item.node}
          </View>
        );
      })}
    </View>
  );
}

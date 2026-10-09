import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { bentoBands, bentoColumns, packBento, type BentoSpan } from './bentoLayout';
import { useTheme } from './theme';

export type BentoItem = { key: string; span: BentoSpan; node: ReactNode };

type BentoGridProps = { items: readonly BentoItem[] };

/**
 * Responsive bento grid: 2 columns (1 at font scale ≥ 1.5, or ≥ 1.3 on narrow screens), tiles of
 * 1x1 / 2x1 / 1x2 / 2x2 spans packed in reading order. Each row is at least `bento.rowHeight`
 * scaled by the font scale and grows with its content (never clips); each tile fills its cell.
 */
export function BentoGrid({ items }: BentoGridProps) {
  const theme = useTheme();
  const window = useWindowDimensions();
  const gap = theme.bento.gap;
  const columns = bentoColumns(window.width, window.fontScale, theme.bento);
  const rowHeight = Math.round(theme.bento.rowHeight * Math.max(1, window.fontScale));
  const spanHeight = (rows: number) => rows * rowHeight + (rows - 1) * gap;
  const { cells, rows } = packBento(
    items.map((item) => item.span),
    columns,
  );
  const bands = bentoBands(cells, columns, rows);

  const cell = (index: number, rowSpan: number, grow: boolean) => {
    const item = items[index];
    if (!item) return null;
    return (
      <View
        key={item.key}
        testID={`bento-cell-${item.key}`}
        style={{ minHeight: spanHeight(rowSpan), flexGrow: grow ? 1 : 0 }}
      >
        {item.node}
      </View>
    );
  };

  return (
    <View testID="bento-grid" style={{ width: '100%', gap }}>
      {bands.map((band, bandIndex) =>
        band.kind === 'wide' ? (
          cell(band.index, band.rows, false)
        ) : (
          <View key={`band-${bandIndex}`} style={{ flexDirection: 'row', gap }}>
            {band.columns.map((slots, col) => (
              <View key={`col-${col}`} style={{ flex: 1, gap }}>
                {slots.map((slot, slotIndex) =>
                  slot.kind === 'tile' ? (
                    // The last tile of a shorter column stretches to the band's bottom edge.
                    cell(slot.index, slot.rows, slotIndex === slots.length - 1)
                  ) : (
                    <View key={`gap-${slotIndex}`} style={{ height: spanHeight(slot.rows) }} />
                  ),
                )}
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

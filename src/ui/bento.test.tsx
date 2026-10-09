import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Drop } from 'phosphor-react-native';
import { StyleSheet } from 'react-native';

import { BentoGrid } from './BentoGrid';
import { bentoBands, bentoColumns, packBento, tileMinHeight } from './bentoLayout';
import { BentoTile } from './BentoTile';
import { makeTheme, ThemeProvider } from './theme';

const rule = makeTheme('light').bento;

describe('packBento', () => {
  it('packs 2x2, 1x1, 1x2 and 2x1 tiles without overlap, in reading order', () => {
    const { cells, rows } = packBento(['2x2', '1x1', '1x2', '1x1', '2x1'], 2);
    expect(cells).toEqual([
      { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 2 },
      { col: 0, row: 3, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 4, colSpan: 2, rowSpan: 1 },
    ]);
    expect(rows).toBe(5);
  });

  it('fills a hole left by a tall tile with the next small one', () => {
    const { cells } = packBento(['1x2', '1x1', '1x1'], 2);
    expect(cells[1]).toEqual({ col: 1, row: 0, colSpan: 1, rowSpan: 1 });
    expect(cells[2]).toEqual({ col: 1, row: 1, colSpan: 1, rowSpan: 1 });
  });

  it('stacks everything one column wide on a single column', () => {
    const { cells, rows } = packBento(['2x2', '2x1', '1x1'], 1);
    expect(cells.map((cell) => cell.colSpan)).toEqual([1, 1, 1]);
    expect(rows).toBe(4);
  });

  it('uses one column on narrow screens with large text, and at any width from 1.5', () => {
    expect(bentoColumns(360, 1, rule)).toBe(2);
    expect(bentoColumns(360, 1.3, rule)).toBe(1);
    expect(bentoColumns(412, 1.3, rule)).toBe(2);
    expect(bentoColumns(800, 1.5, rule)).toBe(1);
  });
});

describe('bentoBands', () => {
  it('splits full-width tiles into their own bands and stacks the rest per column', () => {
    // 1x1 (0,0), 2x1 (row 1), 1x1 fills (0,1), 1x2 (2..3, col 0), 1x1 (2, col 1).
    const { cells, rows } = packBento(['1x1', '2x1', '1x1', '1x2', '1x1'], 2);
    expect(bentoBands(cells, 2, rows)).toEqual([
      {
        kind: 'columns',
        columns: [[{ kind: 'tile', index: 0, rows: 1 }], [{ kind: 'tile', index: 2, rows: 1 }]],
      },
      { kind: 'wide', index: 1, rows: 1 },
      {
        kind: 'columns',
        columns: [[{ kind: 'tile', index: 3, rows: 2 }], [{ kind: 'tile', index: 4, rows: 1 }]],
      },
    ]);
  });

  it('one column is a single list in reading order', () => {
    const { cells, rows } = packBento(['2x2', '1x1', '2x1'], 1);
    expect(bentoBands(cells, 1, rows)).toEqual([
      {
        kind: 'columns',
        columns: [
          [
            { kind: 'tile', index: 0, rows: 2 },
            { kind: 'tile', index: 1, rows: 1 },
            { kind: 'tile', index: 2, rows: 1 },
          ],
        ],
      },
    ]);
  });
});

describe('tileMinHeight (no clipped text)', () => {
  const theme = makeTheme('light');
  const metrics = {
    padding: theme.space[4],
    gap: theme.space[1],
    titleLine: 24,
    valueLine: 34,
    captionLine: 18,
    captionMaxLines: 2,
  };
  const full = { value: true, caption: true };

  it('fits the title, the value and two caption lines at font scale 1', () => {
    // 2 x 16 padding + 24 + 34 + 2 x 18 + 2 gaps of 4.
    expect(tileMinHeight(full, metrics, 1)).toBe(134);
    expect(tileMinHeight({ value: false, caption: true }, metrics, 1)).toBe(96);
    expect(tileMinHeight({ value: false, caption: false }, metrics, 1)).toBe(56);
  });

  it('scales the text lines (not the padding) at 1.3 and never shrinks below 1', () => {
    expect(tileMinHeight(full, metrics, 1.3)).toBe(Math.ceil(32 + 94 * 1.3 + 8));
    expect(tileMinHeight(full, metrics, 0.85)).toBe(134);
  });

  it.each([
    [360, 1],
    [360, 1.3],
    [412, 1],
    [412, 1.3],
  ])(
    'at %i dp and font %s the row is at least the tile content (grows, never clips)',
    (width, fontScale) => {
      const columns = bentoColumns(width, fontScale, theme.bento);
      expect(columns).toBe(width === 360 && fontScale >= 1.3 ? 1 : 2);
      // A full tile needs more than the grid's row floor, so its own minimum must drive the row.
      expect(tileMinHeight(full, metrics, fontScale)).toBeGreaterThan(
        Math.round(theme.bento.rowHeight * fontScale),
      );
    },
  );
});

describe('BentoGrid + BentoTile', () => {
  it('renders tiles that open their detail page and speak a summary', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider mode="dark">
        <BentoGrid
          items={[
            {
              key: 'agua',
              span: '2x1',
              node: (
                <BentoTile
                  section="agua"
                  icon={Drop}
                  title="Agua"
                  value="6/8"
                  caption="vasos hoy"
                  accessibilityLabel="Agua: 6 de 8 vasos. Abrir detalle"
                  onPress={onPress}
                />
              ),
            },
            {
              key: 'sueno',
              span: '1x1',
              node: (
                <BentoTile
                  section="sueno"
                  variant="hero"
                  title="Sueño"
                  value="7 h"
                  accessibilityLabel="Sueño: 7 horas"
                  onPress={() => undefined}
                />
              ),
            },
          ]}
        />
      </ThemeProvider>,
    );
    const theme = makeTheme('dark');
    const tile = screen.getByRole('button', { name: 'Agua: 6 de 8 vasos. Abrir detalle' });
    const style = StyleSheet.flatten(tile.props.style);
    expect(style.backgroundColor).toBe(theme.section.agua.soft);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    // Grows from its content (basis auto) and never hides overflowing text.
    expect(style.flexGrow).toBe(1);
    expect(style.flex).toBeUndefined();
    expect(style.overflow).toBeUndefined();
    expect(
      StyleSheet.flatten(screen.getByRole('button', { name: 'Sueño: 7 horas' }).props.style)
        .backgroundColor,
    ).toBe(theme.section.sueno.fill);
    await fireEvent.press(tile);
    expect(onPress).toHaveBeenCalledTimes(1);
    // Cells have a minimum height (rows grow with the content instead of clipping it).
    const wide = StyleSheet.flatten(screen.getByTestId('bento-cell-agua').props.style);
    expect(wide.minHeight).toBeGreaterThanOrEqual(theme.bento.rowHeight);
    expect(wide.height).toBeUndefined();
  });
});

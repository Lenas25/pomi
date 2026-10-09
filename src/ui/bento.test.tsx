import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Drop } from 'phosphor-react-native';
import { StyleSheet } from 'react-native';

import { BentoGrid } from './BentoGrid';
import { bentoColumns, packBento } from './bentoLayout';
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

  it('uses one column only on narrow screens with large text', () => {
    expect(bentoColumns(360, 1, rule)).toBe(2);
    expect(bentoColumns(360, 1.3, rule)).toBe(1);
    expect(bentoColumns(412, 1.3, rule)).toBe(2);
  });
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
    expect(
      StyleSheet.flatten(screen.getByRole('button', { name: 'Sueño: 7 horas' }).props.style)
        .backgroundColor,
    ).toBe(theme.section.sueno.fill);
    await fireEvent.press(tile);
    expect(onPress).toHaveBeenCalledTimes(1);
    // The 2x1 tile spans the full row; the 1x1 goes to the next row.
    const wide = StyleSheet.flatten(screen.getByTestId('bento-cell-agua').props.style);
    const small = StyleSheet.flatten(screen.getByTestId('bento-cell-sueno').props.style);
    expect(small.top).toBeGreaterThan(wide.top as number);
    expect(wide.width).toBeGreaterThan(small.width as number);
  });
});

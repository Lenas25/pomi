// Pure packing for the bento grid: places tiles of 1x1 / 2x1 / 1x2 / 2x2 spans (columns x rows)
// on a 1- or 2-column grid, first free slot in reading order, never overlapping.

export type BentoSpan = '1x1' | '2x1' | '1x2' | '2x2';

export type BentoCell = { col: number; row: number; colSpan: number; rowSpan: number };

export function spanSize(span: BentoSpan): { cols: number; rows: number } {
  const [cols, rows] = span.split('x').map(Number);
  return { cols: cols ?? 1, rows: rows ?? 1 };
}

/**
 * Cells for each span, in order. With one column every tile is one column wide (a 2x2 becomes
 * 1x2). Returns the cells and the total number of rows used.
 */
export function packBento(
  spans: readonly BentoSpan[],
  columns: 1 | 2,
): { cells: BentoCell[]; rows: number } {
  const taken: boolean[][] = [];
  const free = (row: number, col: number) => !(taken[row]?.[col] ?? false);
  const cells: BentoCell[] = [];
  for (const span of spans) {
    const size = spanSize(span);
    const colSpan = Math.min(size.cols, columns);
    const rowSpan = size.rows;
    let placed: BentoCell | null = null;
    for (let row = 0; placed === null; row += 1) {
      for (let col = 0; col + colSpan <= columns && placed === null; col += 1) {
        let fits = true;
        for (let r = row; r < row + rowSpan && fits; r += 1)
          for (let c = col; c < col + colSpan && fits; c += 1) fits = free(r, c);
        if (fits) placed = { col, row, colSpan, rowSpan };
      }
    }
    for (let r = placed.row; r < placed.row + rowSpan; r += 1) {
      const line = (taken[r] ??= []);
      for (let c = placed.col; c < placed.col + colSpan; c += 1) line[c] = true;
    }
    cells.push(placed);
  }
  return { cells, rows: taken.length };
}

/** One column on narrow screens with large text (audit rule), else two. */
export function bentoColumns(
  width: number,
  fontScale: number,
  rule: { singleColumnMaxWidth: number; singleColumnFontScale: number },
): 1 | 2 {
  return fontScale >= rule.singleColumnFontScale && width < rule.singleColumnMaxWidth ? 1 : 2;
}

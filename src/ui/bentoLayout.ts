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

/**
 * One column with large text: always from `singleColumnAnyWidthFontScale` (1.5), and on narrow
 * screens already from `singleColumnFontScale` (1.3). Else two.
 */
export function bentoColumns(
  width: number,
  fontScale: number,
  rule: {
    singleColumnMaxWidth: number;
    singleColumnFontScale: number;
    singleColumnAnyWidthFontScale: number;
  },
): 1 | 2 {
  if (fontScale >= rule.singleColumnAnyWidthFontScale) return 1;
  return fontScale >= rule.singleColumnFontScale && width < rule.singleColumnMaxWidth ? 1 : 2;
}

/** A slot of a band column: a tile (index into the items) or an empty gap of `rows` rows. */
export type BandSlot =
  { kind: 'tile'; index: number; rows: number } | { kind: 'empty'; rows: number };

/**
 * Horizontal bands of the packed grid, laid out with flexbox so rows can grow with their content
 * (`minHeight`) instead of clipping it: a full-width tile is a band of its own; the tiles between
 * two full-width ones form a band of independent columns, each a top-to-bottom list of slots.
 */
export type BentoBand =
  { kind: 'wide'; index: number; rows: number } | { kind: 'columns'; columns: BandSlot[][] };

export function bentoBands(cells: readonly BentoCell[], columns: 1 | 2, rows: number): BentoBand[] {
  const bands: BentoBand[] = [];
  const wideAt = new Map<number, number>();
  cells.forEach((cell, index) => {
    if (cell.colSpan === columns && columns > 1) wideAt.set(cell.row, index);
  });
  let row = 0;
  while (row < rows) {
    const wide = wideAt.get(row);
    if (wide !== undefined) {
      const rowSpan = cells[wide]?.rowSpan ?? 1;
      bands.push({ kind: 'wide', index: wide, rows: rowSpan });
      row += rowSpan;
      continue;
    }
    let end = row;
    while (end < rows && !wideAt.has(end)) end += 1;
    const lists: BandSlot[][] = [];
    for (let col = 0; col < columns; col += 1) {
      const slots: BandSlot[] = [];
      for (let r = row; r < end;) {
        const index = cells.findIndex((cell) => cell.col === col && cell.row === r);
        const cell = cells[index];
        if (cell) {
          slots.push({ kind: 'tile', index, rows: cell.rowSpan });
          r += cell.rowSpan;
        } else {
          const last = slots[slots.length - 1];
          if (last?.kind === 'empty') last.rows += 1;
          else slots.push({ kind: 'empty', rows: 1 });
          r += 1;
        }
      }
      // A trailing gap only pads the column; flexbox already stretches the band.
      if (slots[slots.length - 1]?.kind === 'empty') slots.pop();
      lists.push(slots);
    }
    bands.push({ kind: 'columns', columns: lists });
    row = end;
  }
  return bands;
}

// Check-in averages for the AI context. PURE: 1-5 answers only, rounded to one decimal.
type Answers = Readonly<Record<string, unknown>>;

const rating = (answers: Answers, id: string): number | undefined => {
  const value = answers[id];
  return typeof value === 'number' && value >= 1 && value <= 5 ? value : undefined;
};

/** Average of one 1-5 question over the rows, or `null` when never answered. */
export function averageRating(rows: readonly { answers: Answers }[], id: string): number | null {
  const values = rows.flatMap((row) => {
    const value = rating(row.answers, id);
    return value === undefined ? [] : [value];
  });
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

/** Non-empty free-text answers of one question, as dated notes. */
export function textAnswers(
  rows: readonly { date: string; answers: Answers }[],
  id: string,
): { date: string; text: string }[] {
  return rows.flatMap((row) => {
    const value = row.answers[id];
    return typeof value === 'string' && value.trim() !== ''
      ? [{ date: row.date, text: value }]
      : [];
  });
}

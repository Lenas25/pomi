// Pomi hides the native scroll indicators everywhere (owner decision): every ScrollView /
// FlatList / SectionList spreads this right after its tag, `Screen` included, so new screens
// inherit it. `scroll.test.ts` fails when a scroll container forgets it.
export const hiddenScrollIndicators = {
  showsVerticalScrollIndicator: false,
  showsHorizontalScrollIndicator: false,
} as const;

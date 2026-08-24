/**
 * Small deterministic fuzzy matcher for settings search.
 *
 * Queries match as ordered subsequences. Consecutive characters, word
 * boundaries, prefixes, and early positions score higher, which gives useful
 * ranking without adding a general-purpose fuzzy-search dependency.
 */

/** One searchable field and its relative importance. */
export interface FuzzySearchField<T> {
  readonly value: (item: T) => string;
  readonly weight: number;
}

/** A ranked item paired with its aggregate score. */
export interface FuzzySearchResult<T> {
  readonly item: T;
  readonly score: number;
}

/** Returns whether a character starts a word or camel-case segment. */
function isBoundary(target: string, index: number): boolean {
  if (index === 0) return true;
  const previous = target[index - 1]!;
  const current = target[index]!;
  return !/[a-z0-9]/i.test(previous) || (/[a-z]/.test(previous) && /[A-Z]/.test(current));
}

/**
 * Scores an ordered, case-insensitive subsequence match.
 *
 * Args:
 *   query: Text to find in `target`.
 *   target: Candidate text being scored.
 *
 * Returns:
 *   Zero when the query does not match; otherwise a positive score where
 *   larger values represent tighter and earlier matches.
 */
export function fuzzyScore(query: string, target: string): number {
  const needle = query.trim().toLocaleLowerCase();
  const haystack = target.toLocaleLowerCase();
  if (needle === "" || haystack === "") return 0;

  let score = 0;
  let targetIndex = 0;
  let previousMatch = -2;

  for (const character of needle) {
    const matchIndex = haystack.indexOf(character, targetIndex);
    if (matchIndex === -1) return 0;

    // Base points guarantee every complete subsequence remains a positive match.
    score += 10;
    if (matchIndex === previousMatch + 1) score += 14;
    if (isBoundary(target, matchIndex)) score += 10;
    score += Math.max(0, 12 - matchIndex);

    // Sparse matches rank below compact runs even when both start early.
    if (previousMatch >= 0) score -= Math.min(8, matchIndex - previousMatch - 1);
    previousMatch = matchIndex;
    targetIndex = matchIndex + 1;
  }

  if (haystack === needle) score += 100;
  else if (haystack.startsWith(needle)) score += 60;
  else if (haystack.includes(needle)) score += 30;

  return Math.max(1, score);
}

/**
 * Searches weighted fields and returns stable best-first results.
 *
 * Whitespace-separated query tokens may match different fields, but every
 * token must match at least one field. The best weighted field score for each
 * token contributes to the item's total.
 *
 * Args:
 *   query: User-entered search text.
 *   items: Candidate items in their stable fallback order.
 *   fields: Searchable fields and their relative weights.
 *
 * Returns:
 *   Matching items sorted by descending score, preserving input order for ties.
 */
export function fuzzySearch<T>(
  query: string,
  items: readonly T[],
  fields: readonly FuzzySearchField<T>[]
): readonly FuzzySearchResult<T>[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  return items
    .map((item, index) => {
      let score = 0;
      for (const token of tokens) {
        const tokenScore = Math.max(
          0,
          ...fields.map((field) => fuzzyScore(token, field.value(item)) * field.weight)
        );
        if (tokenScore === 0) return null;
        score += tokenScore;
      }
      return { item, score, index };
    })
    .filter((result): result is FuzzySearchResult<T> & { readonly index: number } => result !== null)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item, score }) => ({ item, score }));
}

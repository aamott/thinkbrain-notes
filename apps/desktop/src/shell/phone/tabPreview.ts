import { parseFrontmatter } from "@thinkbrain/core";

/** Characters a card can show before the text stops being scannable. */
const DEFAULT_LIMIT = 180;

/**
 * The opening prose of a note, for a tab card.
 *
 * Frontmatter is stripped through the same parser the editor uses — without it
 * every card would preview `---` and a title key rather than the note. Newlines
 * collapse to spaces because the card wraps its own lines and a preserved blank
 * line would waste a third of the visible area.
 */
export function previewText(contents: string): string {
  const body = parseFrontmatter(contents).body;
  const flattened = body.replace(/\s+/g, " ").trim();
  if (flattened.length <= DEFAULT_LIMIT) return flattened;
  return `${flattened.slice(0, DEFAULT_LIMIT)}…`;
}

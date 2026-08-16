import type { Text } from "@codemirror/state";

/**
 * Locates a YAML frontmatter block so live preview can style it as structured
 * data and suppress Markdown decoration inside it.
 *
 * This is deliberately a plain scan rather than a Lezer parser extension. The
 * only thing the decorator needs is the block's extent, and a pure function
 * over the document is far cheaper to reason about and test than nesting a
 * second language inside the Markdown parser.
 */

/** A frontmatter block, covering both fence lines inclusive. */
export interface FrontmatterRange {
  readonly from: number;
  readonly to: number;
  /** 1-based line number of the opening `---`. */
  readonly firstLine: number;
  /** 1-based line number of the closing `---`. */
  readonly lastLine: number;
}

/** Matches a fence line: exactly three dashes plus optional trailing space. */
const FENCE = /^---[ \t]*$/;

/**
 * Returns the frontmatter block at the very start of `doc`, or `null`.
 *
 * A block must open on line 1, close on a later line, and contain at least one
 * body line — `---\n---` is treated as two horizontal rules, not an empty
 * block.
 */
export function findFrontmatterRange(doc: Text): FrontmatterRange | null {
  if (doc.lines < 3) return null;
  if (!FENCE.test(doc.line(1).text)) return null;

  for (let lineNumber = 2; lineNumber <= doc.lines; lineNumber++) {
    const line = doc.line(lineNumber);
    if (!FENCE.test(line.text)) continue;
    // `lineNumber === 2` means an empty block; leave it to the Markdown parser.
    if (lineNumber === 2) return null;
    return { from: 0, to: line.to, firstLine: 1, lastLine: lineNumber };
  }

  return null;
}

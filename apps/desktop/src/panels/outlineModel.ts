/**
 * A navigable Markdown heading in its original document location.
 */
export type Heading = {
  readonly level: number;
  readonly text: string;
  readonly line: number;
};

const ATX_HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const FRONTMATTER_FENCE_PATTERN = /^---[ \t]*$/;

/**
 * Extracts ATX headings from a Markdown document without changing its contents.
 *
 * A leading, closed YAML frontmatter block is skipped so values in metadata do
 * not become outline entries. Line numbers remain 1-based document positions,
 * allowing callers to navigate the original editor document directly.
 */
export function extractHeadings(markdown: string): readonly Heading[] {
  const lines = markdown.split(/\r?\n/);
  const firstLine = lines[0]?.replace(/^\uFEFF/, "") ?? "";
  let bodyStartIndex = 0;

  if (FRONTMATTER_FENCE_PATTERN.test(firstLine)) {
    const closingFenceIndex = lines.findIndex(
      (line, index) => index > 0 && FRONTMATTER_FENCE_PATTERN.test(line),
    );

    if (closingFenceIndex !== -1) {
      bodyStartIndex = closingFenceIndex + 1;
    }
  }

  const headings: Heading[] = [];
  for (let index = bodyStartIndex; index < lines.length; index += 1) {
    const match = ATX_HEADING_PATTERN.exec(lines[index] ?? "");
    if (!match) continue;

    headings.push({
      level: match[1]!.length,
      text: match[2]!.trim(),
      line: index + 1,
    });
  }

  return headings;
}

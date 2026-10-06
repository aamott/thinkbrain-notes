/**
 * A navigable Markdown heading in its original document location.
 */
import { parseFrontmatter } from "@thinkbrain/core";

export type Heading = {
  readonly level: number;
  readonly text: string;
  readonly line: number;
};

const ATX_HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;

/**
 * Extracts ATX headings from a Markdown document without changing its contents.
 *
 * A leading, closed YAML frontmatter block is skipped so values in metadata do
 * not become outline entries. Line numbers remain 1-based document positions,
 * allowing callers to navigate the original editor document directly.
 */
export function extractHeadings(markdown: string): readonly Heading[] {
  const lines = markdown.split(/\r?\n/);
  const frontmatter = parseFrontmatter(markdown).frontmatter;
  // `endOffset` is a character offset; the body's first line is the line count
  // of everything the fence block consumed (its trailing newline included).
  const bodyStartIndex = frontmatter
    ? markdown.slice(0, frontmatter.endOffset).split(/\r?\n/).length - 1
    : 0;

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

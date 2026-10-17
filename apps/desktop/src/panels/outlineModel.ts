/**
 * A navigable Markdown heading in its original document location.
 */
import { Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { GFM, parser } from "@lezer/markdown";
import { parseFrontmatter } from "@thinkbrain/core";

export type Heading = {
  readonly level: number;
  readonly text: string;
  readonly line: number;
};

/** GFM Markdown parser shared by the outline and same-note anchor lookup. */
const headingParser = parser.configure(GFM);

const HEADING = /^ATXHeading([1-6])$/;
// Marker-only syntax dropped from labels: delimiters, closing ATX marks,
// emphasis/code/strikethrough ticks, link brackets and titles, HTML tags.
const DROPPED_CHILDREN = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "LinkMark",
  "StrikethroughMark",
  "LinkTitle",
  "HTMLTag"
]);
// Only under Link/Image the destination is syntax, not text: an autolink
// or bare URL elsewhere stays visible.
const DROPS_URL = new Set(["Link", "Image"]);

/**
 * The heading's plain-text label: every child's gap and text in source
 * order, minus markup-only nodes. `[text](url)` keeps "text", `*em*` keeps
 * "em", inline code keeps its contents. `body` is the post-frontmatter
 * slice the tree was parsed from, so node offsets index it directly.
 */
function headingLabel(node: SyntaxNode, body: string, out: string[]): void {
  let cursor = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    // A dropped node skips its own range but the gap before it still emits:
    // a link's text lives between the dropped marks.
    out.push(body.slice(cursor, child.from));
    if (
      DROPPED_CHILDREN.has(child.name) ||
      (DROPS_URL.has(node.name) && child.name === "URL")
    ) {
      cursor = child.to;
      continue;
    }
    headingLabel(child, body, out);
    cursor = child.to;
  }
  out.push(body.slice(cursor, node.to));
}

/**
 * Extracts ATX headings from a Markdown document without changing its contents.
 *
 * The real Lezer parse decides what is a heading: indented (3 spaces or
 * fewer) and blockquoted ATX lines count, fenced code and HTML do not: the
 * old regex could not tell `# heading` inside a fence apart. A leading,
 * closed YAML frontmatter block is skipped by starting the parse at the
 * body, so metadata values can neither become entries nor leave an open
 * fence behind that swallows the first real heading. Line numbers stay
 * 1-based document positions so callers navigate the original document.
 */
export function extractHeadings(markdown: string): readonly Heading[] {
  const doc = Text.of(markdown.split("\n"));
  // `endOffset` is already a raw offset into `markdown`, CRLF-safe.
  const bodyFrom = parseFrontmatter(markdown).frontmatter?.endOffset ?? 0;
  const body = markdown.slice(bodyFrom);

  const headings: Heading[] = [];
  headingParser.parse(body).iterate({
    enter: (node) => {
      const match = HEADING.exec(node.name);
      if (!match) return;
      const parts: string[] = [];
      headingLabel(node.node, body, parts);
      const text = parts.join("").trim();
      if (text === "") return;
      headings.push({
        level: Number(match[1]),
        text,
        line: doc.lineAt(bodyFrom + node.from).number
      });
    }
  });
  return headings;
}

/**
 * The URL fragment id a heading claims: the project's normalized heading
 * id: NFC, lowercase, punctuation dropped (letters/numbers/marks/
 * whitespace/`_`/`-` survive), whitespace collapsed to `-`. Duplicates pick
 * up `-1`, `-2`, and so on in document order.
 */
function slug(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

/**
 * The 1-based line of the heading `fragment` names, an already-decoded
 * fragment, or `null` when no heading's canonical id matches. `""` means
 * the top of the note.
 */
export function resolveHeadingLine(markdown: string, fragment: string): number | null {
  if (fragment === "") return 1;
  const target = slug(fragment);
  if (target === "") return null;
  const used = new Set<string>();
  for (const heading of extractHeadings(markdown)) {
    const base = slug(heading.text);
    // An all-punctuation heading claims no id at all: it must not occupy
    // a numbered slot a real heading's duplicate would take.
    if (base === "") continue;
    let id = base;
    for (let n = 1; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    if (id === target) return heading.line;
  }
  return null;
}

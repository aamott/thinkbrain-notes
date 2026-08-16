import type { InlineContext, MarkdownConfig } from "@lezer/markdown";

/**
 * Lezer inline parser for `[[Target]]` and `[[Target|alias]]`.
 *
 * Registered `before: "Link"` so `[[` is claimed here rather than being read
 * as a link containing a nested bracket. Unterminated openers return -1 and
 * fall through to normal Markdown parsing untouched.
 */

const OPEN_BRACKET = 91; // "["
const CLOSE_BRACKET = 93; // "]"
const PIPE = 124; // "|"
const NEWLINE = 10;

export const wikiLinkExtension: MarkdownConfig = {
  defineNodes: [{ name: "WikiLink" }, { name: "WikiLinkMark" }, { name: "WikiLinkAlias" }],
  parseInline: [
    {
      name: "WikiLink",
      before: "Link",
      parse(cx: InlineContext, next: number, pos: number): number {
        if (next !== OPEN_BRACKET || cx.char(pos + 1) !== OPEN_BRACKET) return -1;

        let scan = pos + 2;
        let pipe = -1;
        let closed = false;
        while (scan < cx.end) {
          const ch = cx.char(scan);
          // A newline ends the candidate: wiki links do not span lines.
          if (ch === NEWLINE) return -1;
          if (ch === PIPE && pipe === -1) pipe = scan;
          if (ch === CLOSE_BRACKET && cx.char(scan + 1) === CLOSE_BRACKET) {
            closed = true;
            break;
          }
          scan++;
        }
        // Reject an unterminated opener, and `[[]]`, which has no target.
        if (!closed || scan === pos + 2) return -1;

        const end = scan + 2;
        const children = [
          cx.elt("WikiLinkMark", pos, pos + 2),
          cx.elt("WikiLinkMark", scan, end)
        ];
        if (pipe !== -1) children.splice(1, 0, cx.elt("WikiLinkAlias", pipe, scan));

        return cx.addElement(cx.elt("WikiLink", pos, end, children));
      }
    }
  ]
};

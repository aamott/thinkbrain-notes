import { Decoration } from "@codemirror/view";

import type { NodeHandler } from "../decorate";
import { selectionTouchesLine } from "../reveal";

/**
 * Blockquotes and horizontal rules — both line-leading constructs, so both
 * reveal per line.
 */

const blockquote: NodeHandler = (node, ctx) => {
  const { doc } = ctx.state;
  const firstLine = doc.lineAt(node.from).number;
  const lastLine = doc.lineAt(node.to).number;
  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
    const line = doc.line(lineNumber);
    ctx.present(Decoration.line({ class: "cm-quote-line" }), line.from, line.from);
  }
};

/** `QuoteMark` is a separate node, visited on its own. */
const quoteMark: NodeHandler = (node, ctx) => {
  const { doc } = ctx.state;
  // Swallow the single space Markdown allows after `>`.
  const to = doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
  ctx.conceal(node.from, to, selectionTouchesLine(ctx.state, node.from));
};

const horizontalRule: NodeHandler = (node, ctx) => {
  const line = ctx.state.doc.lineAt(node.from);
  ctx.present(Decoration.line({ class: "cm-hr-line" }), line.from, line.from);
  ctx.conceal(node.from, node.to, selectionTouchesLine(ctx.state, node.from));
};

export const blockHandlers: Record<string, NodeHandler> = {
  Blockquote: blockquote,
  QuoteMark: quoteMark,
  HorizontalRule: horizontalRule
};

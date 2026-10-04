import { Decoration } from "@codemirror/view";

import { decorateLines, type NodeHandler } from "../decorate";
import { selectionTouchesLine, selectionTouchesRange } from "../reveal";

/**
 * Inline code spans and fenced code blocks.
 *
 * Inline spans reveal per node; fences reveal per line, because a fence is a
 * line-leading marker with no meaningful inside for a cursor to occupy.
 */

const inlineCode: NodeHandler = (node, ctx) => {
  ctx.present(Decoration.mark({ class: "cm-inline-code" }), node.from, node.to);

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  for (const mark of node.node.getChildren("CodeMark")) {
    ctx.conceal(mark.from, mark.to, revealed);
  }
};

const fencedCode: NodeHandler = (node, ctx) => {
  const { doc } = ctx.state;
  decorateLines(ctx, node, "cm-code-line", {
    first: " cm-code-line-first",
    last: " cm-code-line-last"
  });

  // Conceal each fence across its whole line so the info string (```js) goes
  // with it; `getChildren` yields the opening fence first.
  for (const mark of node.node.getChildren("CodeMark")) {
    const line = doc.lineAt(mark.from);
    ctx.conceal(line.from, line.to, selectionTouchesLine(ctx.state, mark.from));
  }
};

export const codeHandlers: Record<string, NodeHandler> = {
  InlineCode: inlineCode,
  FencedCode: fencedCode
};

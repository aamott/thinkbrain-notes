import { Decoration } from "@codemirror/view";

import type { NodeHandler } from "../decorate";
import { selectionTouchesRange } from "../reveal";

/**
 * Bold, italic and strikethrough.
 *
 * Reveal is per-node: the cursor must be inside (or on the boundary of) the
 * emphasised run itself, so moving through one bold word does not flash the
 * markers of every other span on the line.
 */
const emphasis =
  (className: string, markName: string): NodeHandler =>
  (node, ctx) => {
    ctx.present(Decoration.mark({ class: className }), node.from, node.to);

    const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
    for (const mark of node.node.getChildren(markName)) {
      ctx.conceal(mark.from, mark.to, revealed);
    }
  };

export const emphasisHandlers: Record<string, NodeHandler> = {
  StrongEmphasis: emphasis("cm-strong", "EmphasisMark"),
  Emphasis: emphasis("cm-em", "EmphasisMark"),
  Strikethrough: emphasis("cm-strike", "StrikethroughMark")
};

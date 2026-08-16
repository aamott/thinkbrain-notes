import { Decoration } from "@codemirror/view";

import type { NodeHandler } from "../decorate";
import { selectionTouchesLine } from "../reveal";

/**
 * ATX headings (`## Title`).
 *
 * The line always carries its level class, so revealing the source does not
 * make the text jump between type sizes — it only makes the `##` reappear.
 */

const heading =
  (level: number): NodeHandler =>
  (node, ctx) => {
    const line = ctx.state.doc.lineAt(node.from);
    ctx.present(Decoration.line({ class: `cm-heading cm-h${level}` }), line.from, line.from);

    const mark = node.node.getChild("HeaderMark");
    if (!mark) return;

    // Swallow the single space Markdown allows between `##` and the text.
    const concealTo =
      ctx.state.doc.sliceString(mark.to, mark.to + 1) === " " ? mark.to + 1 : mark.to;
    ctx.conceal(mark.from, concealTo, selectionTouchesLine(ctx.state, node.from));
  };

export const headingHandlers: Record<string, NodeHandler> = {
  ATXHeading1: heading(1),
  ATXHeading2: heading(2),
  ATXHeading3: heading(3),
  ATXHeading4: heading(4),
  ATXHeading5: heading(5),
  ATXHeading6: heading(6)
};

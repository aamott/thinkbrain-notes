import { Decoration } from "@codemirror/view";

import type { NodeHandler } from "../decorate";
import { selectionTouchesLine } from "../reveal";

/**
 * GFM tables.
 *
 * A text editor cannot render a real grid without replacing the source, so
 * this stops short of that: every table line is set monospaced with tabular
 * numerals so the pipes align into visual columns, the header row is
 * emphasised, and the `| --- | --- |` delimiter row — which carries alignment
 * information but reads as noise — is concealed until the cursor lands on it.
 *
 * The pipes themselves stay visible. They are the only thing marking cell
 * boundaries once the grid is implied rather than drawn.
 */

const table: NodeHandler = (node, ctx) => {
  const { doc } = ctx.state;
  const firstLine = doc.lineAt(node.from).number;
  const lastLine = doc.lineAt(node.to).number;

  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
    const line = doc.line(lineNumber);
    ctx.present(Decoration.line({ class: "cm-table-line" }), line.from, line.from);
  }
};

const tableHeader: NodeHandler = (node, ctx) => {
  const line = ctx.state.doc.lineAt(node.from);
  ctx.present(Decoration.line({ class: "cm-table-header" }), line.from, line.from);
};

/**
 * Lezer reuses `TableDelimiter` for two different things: the whole
 * `| --- | --- |` row, and each individual `|` separating two cells. Only a
 * node covering its entire line is the alignment row; anything shorter is a
 * cell pipe, which stays visible because it is the only remaining cue for
 * where one column ends and the next begins.
 */
const tableDelimiter: NodeHandler = (node, ctx) => {
  const line = ctx.state.doc.lineAt(node.from);
  if (node.from !== line.from || node.to !== line.to) return;

  ctx.present(Decoration.line({ class: "cm-table-delimiter" }), line.from, line.from);
  ctx.conceal(line.from, line.to, selectionTouchesLine(ctx.state, node.from));
};

export const tableHandlers: Record<string, NodeHandler> = {
  Table: table,
  TableHeader: tableHeader,
  TableDelimiter: tableDelimiter
};

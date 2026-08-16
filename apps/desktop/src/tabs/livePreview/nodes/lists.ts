import { Decoration } from "@codemirror/view";

import type { NodeHandler } from "../decorate";
import { TaskCheckboxWidget } from "../widgets";

/**
 * List markers and task checkboxes.
 *
 * Bullet and number markers are styled but never concealed: unlike `##` or
 * `>`, they are part of what the rendered document says, not scaffolding for
 * it.
 */

const listMark: NodeHandler = (node, ctx) => {
  ctx.present(Decoration.mark({ class: "cm-list-mark" }), node.from, node.to);
};

/**
 * `TaskMarker` covers the `[ ]` / `[x]` triple. It is replaced unconditionally
 * — a checkbox is easier to edit than its source, so there is nothing to
 * reveal.
 */
const taskMarker: NodeHandler = (node, ctx) => {
  const checked = /x/i.test(ctx.state.doc.sliceString(node.from, node.to));
  ctx.replaceWith(node.from, node.to, new TaskCheckboxWidget(checked, node.from));
};

const task: NodeHandler = (node, ctx) => {
  const marker = node.node.getChild("TaskMarker");
  if (!marker) return;
  if (!/x/i.test(ctx.state.doc.sliceString(marker.from, marker.to))) return;
  ctx.present(Decoration.mark({ class: "cm-task-done" }), marker.to, node.to);
};

export const listHandlers: Record<string, NodeHandler> = {
  ListMark: listMark,
  TaskMarker: taskMarker,
  Task: task
};

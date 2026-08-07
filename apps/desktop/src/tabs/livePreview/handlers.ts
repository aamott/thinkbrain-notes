import type { NodeHandler } from "./decorate";
import { blockHandlers } from "./nodes/blocks";
import { codeHandlers } from "./nodes/code";
import { emphasisHandlers } from "./nodes/emphasis";
import { headingHandlers } from "./nodes/headings";
import { linkHandlers } from "./nodes/links";
import { listHandlers } from "./nodes/lists";
import { tableHandlers } from "./nodes/tables";

/**
 * Maps Lezer Markdown node names to their decorator.
 *
 * Later work extends this table by spreading in another `nodes/*` record; the
 * engine itself never changes.
 */
export const handlers: Record<string, NodeHandler> = {
  ...headingHandlers,
  ...emphasisHandlers,
  ...codeHandlers,
  ...blockHandlers,
  ...listHandlers,
  ...linkHandlers,
  ...tableHandlers
};

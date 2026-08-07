import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import type { NodeHandler } from "../decorate";
import { selectionTouchesRange } from "../reveal";
import { ImageWidget } from "../widgets";

/**
 * Inline links, images and wiki links.
 *
 * Lezer gives links and images the same shape: `LinkMark` `[`, the text,
 * `LinkMark` `]`, then `(`, a `URL`, and `)`. Concealing everything up to the
 * first mark's end and everything from the second mark's start leaves exactly
 * the link text visible.
 *
 * Following a link is deliberately not implemented — resolving a target to a
 * workspace file is separate work with its own rules.
 */

const REMOTE = /^(https?:|data:)/i;

/** Reads a node's `[`/`]` bracket pair, or `null` for reference-style links. */
function brackets(node: SyntaxNodeRef) {
  const marks = node.node.getChildren("LinkMark");
  const open = marks.at(0);
  const close = marks.at(1);
  return open && close ? { open, close } : null;
}

const link: NodeHandler = (node, ctx) => {
  const pair = brackets(node);
  if (!pair) return;

  ctx.present(Decoration.mark({ class: "cm-link-text" }), pair.open.to, pair.close.from);

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  ctx.conceal(node.from, pair.open.to, revealed);
  ctx.conceal(pair.close.from, node.to, revealed);
};

const image: NodeHandler = (node, ctx) => {
  const pair = brackets(node);
  if (!pair) return;

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  if (revealed) {
    ctx.conceal(node.from, pair.open.to, true);
    ctx.conceal(pair.close.from, node.to, true);
    return;
  }

  const alt = ctx.state.doc.sliceString(pair.open.to, pair.close.from);
  const urlNode = node.node.getChild("URL");
  const rawSrc = urlNode ? ctx.state.doc.sliceString(urlNode.from, urlNode.to) : "";
  const src = REMOTE.test(rawSrc) ? rawSrc : (ctx.options.resolveAssetUrl?.(rawSrc) ?? null);

  if (src) {
    ctx.replaceWith(node.from, node.to, new ImageWidget(src, alt));
    return;
  }

  // Unresolvable: show the alt text as prose rather than a broken image.
  ctx.present(Decoration.mark({ class: "cm-image-text" }), pair.open.to, pair.close.from);
  ctx.conceal(node.from, pair.open.to, false);
  ctx.conceal(pair.close.from, node.to, false);
};

/**
 * `[[Target]]` / `[[Target|alias]]`.
 *
 * With an alias, the target and the pipe are concealed and the alias shows;
 * without one, only the brackets are concealed.
 */
const wikiLink: NodeHandler = (node, ctx) => {
  const marks = node.node.getChildren("WikiLinkMark");
  const open = marks.at(0);
  const close = marks.at(1);
  if (!open || !close) return;

  const alias = node.node.getChild("WikiLinkAlias");
  const textFrom = alias ? alias.from + 1 : open.to;
  const textTo = alias ? alias.to : close.from;

  ctx.present(Decoration.mark({ class: "cm-link-text" }), textFrom, textTo);

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  ctx.conceal(open.from, textFrom, revealed);
  ctx.conceal(textTo, close.to, revealed);
};

export const linkHandlers: Record<string, NodeHandler> = {
  Link: link,
  Image: image,
  WikiLink: wikiLink
};

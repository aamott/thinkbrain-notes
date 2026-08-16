import { resolveWikiLinkTarget } from "@thinkbrain/core";
import { Decoration } from "@codemirror/view";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import type { Text } from "@codemirror/state";

import type { DecorateContext, NodeHandler } from "../decorate";
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

/**
 * Reads the bracket marks and (optional) alias of a `WikiLink` node.
 * Returns `null` if the node is malformed (missing bracket marks).
 */
function wikiLinkParts(node: SyntaxNode) {
  const marks = node.getChildren("WikiLinkMark");
  const open = marks.at(0);
  const close = marks.at(1);
  if (!open || !close) return null;
  return { open, close, alias: node.getChild("WikiLinkAlias") };
}

/**
 * Extracts the raw target string from a `WikiLink` syntax node.
 *
 * The target is the text between `[[` and `|` (or `]]` when there is no alias).
 * Returns `null` if the node is malformed (missing bracket marks).
 */
export function extractWikiLinkTarget(node: SyntaxNode, doc: Text): string | null {
  const parts = wikiLinkParts(node);
  if (!parts) return null;
  const targetTo = parts.alias ? parts.alias.from : parts.close.from;
  return doc.sliceString(parts.open.to, targetTo);
}

const REMOTE = /^(https?:|data:)/i;

/** Reads a node's `[`/`]` bracket pair, or `null` for reference-style links. */
function brackets(node: SyntaxNodeRef) {
  const marks = node.node.getChildren("LinkMark");
  const open = marks.at(0);
  const close = marks.at(1);
  return open && close ? { open, close } : null;
}

/** Conceals the markup before and after a link/image body in one step. */
function concealBrackets(
  ctx: DecorateContext,
  node: SyntaxNodeRef,
  pair: { open: SyntaxNodeRef; close: SyntaxNodeRef },
  revealed: boolean
) {
  ctx.conceal(node.from, pair.open.to, revealed);
  ctx.conceal(pair.close.from, node.to, revealed);
}

const link: NodeHandler = (node, ctx) => {
  const pair = brackets(node);
  if (!pair) return;

  ctx.present(Decoration.mark({ class: "cm-link-text" }), pair.open.to, pair.close.from);

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  concealBrackets(ctx, node, pair, revealed);
};

const image: NodeHandler = (node, ctx) => {
  const pair = brackets(node);
  if (!pair) return;

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  if (revealed) {
    concealBrackets(ctx, node, pair, true);
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
  concealBrackets(ctx, node, pair, false);
};

/**
 * `[[Target]]` / `[[Target|alias]]`.
 *
 * With an alias, the target and the pipe are concealed and the alias shows;
 * without one, only the brackets are concealed.
 *
 * Resolved links (target matches a note in the index) get `cm-link-resolved`
 * and are clickable; unresolved links get `cm-link-broken` and are not.
 */
const wikiLink: NodeHandler = (node, ctx) => {
  const parts = wikiLinkParts(node.node);
  if (!parts) return;
  const { open, close, alias } = parts;

  const textFrom = alias ? alias.from + 1 : open.to;
  const textTo = alias ? alias.to : close.from;

  const target = extractWikiLinkTarget(node.node, ctx.state.doc);
  const { noteIndex } = ctx.options;
  const resolved =
    target !== null && noteIndex !== undefined && resolveWikiLinkTarget(target, noteIndex) !== null;
  const linkClass = resolved ? "cm-link-text cm-link-resolved" : "cm-link-text cm-link-broken";

  ctx.present(Decoration.mark({ class: linkClass }), textFrom, textTo);

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  ctx.conceal(open.from, textFrom, revealed);
  ctx.conceal(textTo, close.to, revealed);
};

export const linkHandlers: Record<string, NodeHandler> = {
  Link: link,
  Image: image,
  WikiLink: wikiLink
};

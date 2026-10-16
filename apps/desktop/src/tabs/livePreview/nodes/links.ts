import { resolveMarkdownLinkTarget, resolveWikiLinkTarget } from "@thinkbrain/core";
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
 * A link reads as resolved — `cm-link-resolved`, Obsidian's pointer cursor —
 * only when its target resolves AND `onOpenLink` exists to follow it; a
 * pointer that lies is worse than no styling. Unresolved targets get
 * `cm-link-broken`. Revealed links add `cm-link-revealed`, which swaps the
 * click affordance back to the editing cursor.
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

  const urlNode = node.node.getChild("URL");
  const rawTarget = urlNode ? ctx.state.doc.sliceString(urlNode.from, urlNode.to) : null;
  // Reference-style links ([text][label]) have no inline URL — the target
  // lives in a definition elsewhere, so there is nothing here to classify.
  const resolution =
    rawTarget === null
      ? undefined
      : resolveMarkdownLinkTarget(
          rawTarget,
          ctx.options.relativePath,
          ctx.options.noteIndex ?? []
        );
  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  const classes = ["cm-link-text"];
  if (resolution === null) classes.push("cm-link-broken");
  else if (resolution !== undefined && ctx.options.onOpenLink) classes.push("cm-link-resolved");
  if (revealed) classes.push("cm-link-revealed");
  ctx.present(Decoration.mark({ class: classes.join(" ") }), pair.open.to, pair.close.from);

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
 * and are clickable; unresolved links get `cm-link-broken` and are not. While
 * the syntax is revealed both additionally carry `cm-link-revealed`, which
 * swaps the click affordance for the editing one.
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

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  const classes = ["cm-link-text"];
  if (resolved && ctx.options.onOpenLink) classes.push("cm-link-resolved");
  else if (!resolved) classes.push("cm-link-broken");
  if (revealed) classes.push("cm-link-revealed");
  ctx.present(Decoration.mark({ class: classes.join(" ") }), textFrom, textTo);

  ctx.conceal(open.from, textFrom, revealed);
  ctx.conceal(textTo, close.to, revealed);
};

export const linkHandlers: Record<string, NodeHandler> = {
  Link: link,
  Image: image,
  WikiLink: wikiLink
};

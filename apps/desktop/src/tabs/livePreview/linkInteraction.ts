import { syntaxTree } from "@codemirror/language";
import type { Extension, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import {
  resolveMarkdownLinkTarget,
  resolveWikiLinkNavigationTarget,
  type MarkdownLinkTarget
} from "@thinkbrain/core";

import { extractWikiLinkTarget } from "./nodes/links";
import type { LivePreviewOptions } from "./options";
import { selectionTouchesRange } from "./reveal";

/**
 * Pointer-gesture link following for live preview.
 *
 * A plain press on a concealed link must navigate, but CodeMirror's
 * `mousedown` handling plants the caret first, revealing the link's syntax
 * and rebuilding the line's DOM — the element under the pointer at `click`
 * may be a `cm-syntax-mark` span or the bare `.cm-line`. Intent is sampled
 * once at `pointerdown` (node range, resolved target, button, coordinates,
 * measured rect); `click` follows from that record, never the release DOM.
 *
 * Any armed press consumes the compatibility `mousedown` so no caret is
 * planted — on touch, the browser's compat mousedown is what CodeMirror
 * sees; `touchstart`/scroll/long-press run natively off pointer events and
 * still work, a scroll cancels via pointermove/pointercancel, and a long-
 * press contextmenu cancels the gesture. `touchDeparture` stays as the
 * fallback so a successful activation restores the pre-press spot for the
 * departure capture even if a caret move still slipped through.
 */

/** How far the pointer may drift (px, Chebyshev) before a press becomes a drag. */
const DRIFT_PX = 6;

/** One in-flight gesture that sampled a followable link at press. */
interface LinkGesture {
  readonly view: EditorView;
  readonly doc: Text; // press-time document: any edit invalidates the gesture
  readonly from: number;
  readonly to: number;
  readonly target: MarkdownLinkTarget;
  readonly rect: DOMRect; // press-time rect: validates a release on rebuilt DOM
  readonly x: number;
  readonly y: number;
  /** Touch only: pre-press selection + viewport, restored on activation. */
  readonly touchDeparture?: {
    readonly anchor: number;
    readonly head: number;
    readonly scroll: ReturnType<EditorView["scrollSnapshot"]>;
  };
}

/** The `WikiLink` or `Link` syntax node containing `pos`, or `null`. */
export function linkNodeAt(view: EditorView, pos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(view.state).resolve(pos, 1);
  while (node && node.name !== "WikiLink" && node.name !== "Link") node = node.parent;
  return node;
}

/** Resolves the navigation target a `WikiLink`/`Link` node points at. */
export function linkTargetAt(
  node: SyntaxNode,
  view: EditorView,
  options: LivePreviewOptions
): MarkdownLinkTarget | null {
  if (node.name === "WikiLink") {
    const targetText = extractWikiLinkTarget(node, view.state.doc);
    if (!targetText) return null;
    // Same resolver the decoration uses: `[[#Heading]]` needs no note index.
    return resolveWikiLinkNavigationTarget(targetText, options.noteIndex ?? []);
  }
  const urlNode = node.getChild("URL");
  if (!urlNode) return null;
  return resolveMarkdownLinkTarget(
    view.state.doc.sliceString(urlNode.from, urlNode.to),
    options.relativePath,
    options.noteIndex ?? []
  );
}

/** Chebyshev distance between the click and the recorded press point. */
function drifted(gesture: LinkGesture, event: MouseEvent): boolean {
  return (
    Math.max(Math.abs(event.clientX - gesture.x), Math.abs(event.clientY - gesture.y)) > DRIFT_PX
  );
}

// The release may retarget onto rebuilt DOM (revealed syntax, the bare
// `.cm-line`): a resolved-link release validates by node identity, else the
// press-time rect — loosened by the drift budget — decides.
function releaseOnSameLink(gesture: LinkGesture, event: MouseEvent, view: EditorView): boolean {
  const target = event.target;
  const releaseEl = target instanceof HTMLElement ? target.closest(".cm-link-resolved") : null;
  if (releaseEl instanceof HTMLElement) {
    const node = linkNodeAt(view, view.posAtDOM(releaseEl));
    return node !== null && node.from === gesture.from && node.to === gesture.to;
  }
  const { rect } = gesture;
  return (
    event.clientX >= rect.left - DRIFT_PX &&
    event.clientX <= rect.right + DRIFT_PX &&
    event.clientY >= rect.top - DRIFT_PX &&
    event.clientY <= rect.bottom + DRIFT_PX
  );
}

/** Resolved links become clickable; without `onOpenLink` they are plain text. */
export function linkFollowHandlers(options: LivePreviewOptions): Extension {
  const openLink = options.onOpenLink;
  if (!openLink) return [];

  let gesture: LinkGesture | null = null;
  const clear = () => {
    gesture = null;
    return false;
  };

  return EditorView.domEventHandlers({
    // Only followable presses are recorded — a primary press on concealed
    // syntax, or any resolved press with Mod held (explicit follow).
    // Revealed plain presses, Shift/Alt selections, secondary buttons: default.
    pointerdown: (event, view) => {
      gesture = null;
      const pointer = event as PointerEvent;
      if (pointer.button !== 0 || pointer.shiftKey || pointer.altKey) return false;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return false;
      const resolvedEl = target.closest(".cm-link-resolved");
      if (!(resolvedEl instanceof HTMLElement)) return false;
      const node = linkNodeAt(view, view.posAtDOM(resolvedEl));
      if (!node) return false;
      const explicit = pointer.ctrlKey || pointer.metaKey;
      if (selectionTouchesRange(view.state, node.from, node.to) && !explicit) return false;
      const linkTarget = linkTargetAt(node, view, options);
      if (!linkTarget) return false;

      // `pointerType` is absent on tests' synthetic MouseEvents → mouse path.
      const mouse = (pointer.pointerType ?? "mouse") === "mouse";
      const main = view.state.selection.main;
      gesture = {
        view,
        doc: view.state.doc,
        from: node.from,
        to: node.to,
        target: linkTarget,
        rect: resolvedEl.getBoundingClientRect(),
        x: pointer.clientX,
        y: pointer.clientY,
        ...(!mouse && {
          touchDeparture: { anchor: main.anchor, head: main.head, scroll: view.scrollSnapshot() }
        })
      };
      return false;
    },

    // Consume mousedown for every armed gesture before CodeMirror plants
    // the caret: no reveal, no rebuild — touch included, since the compat
    // mousedown is its caret channel. Navigation waits for `click`.
    mousedown: (event, view) => {
      if (!gesture || gesture.view !== view || event.button !== 0) return false;
      event.preventDefault();
      return true;
    },

    // A long-press context menu means selection, not navigation — drop the
    // armed gesture so the release can't fire a follow.
    contextmenu: clear,

    pointermove: (event) => (gesture && drifted(gesture, event) ? clear() : false),
    pointercancel: clear,

    click: (event, view) => {
      const start = gesture;
      gesture = null;
      if (
        !start ||
        start.view !== view ||
        view.state.doc !== start.doc ||
        drifted(start, event) ||
        !releaseOnSameLink(start, event, view)
      ) {
        return false;
      }
      // Touch let the native caret move; put the pre-press spot back so the
      // departure capture (and Back) sees where the user actually was.
      if (start.touchDeparture) {
        view.dispatch({
          selection: { anchor: start.touchDeparture.anchor, head: start.touchDeparture.head },
          effects: [start.touchDeparture.scroll]
        });
      }
      openLink(start.target);
      event.preventDefault();
      return true;
    }
  });
}

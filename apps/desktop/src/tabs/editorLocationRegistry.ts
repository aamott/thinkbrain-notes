/**
 * The live CodeMirror views history can capture and restore positions on.
 *
 * `useCodeMirrorView` registers each mounted editor under its `stateKey` (the
 * tab id), so the shell can ask "where is the user in this tab right now"
 * without reaching through React. Everything here is a plain module registry
 * — no DOM queries, no native calls — and deliberately stores *positions*,
 * never `EditorState`: navigation must never resurrect historical text or
 * undo history.
 *
 * Document changes reach stored visits through {@link notifyEditorMapped},
 * which the editor's update listener calls per transaction; the shell maps
 * every stored location for that tab through the ChangeDesc.
 */

import type { ChangeDesc } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import type { EditorLocation } from "./tabHistory";

const liveViews = new Map<string, EditorView>();
const viewListeners = new Set<() => void>();
const mappingListeners = new Set<(tabId: string, changes: ChangeDesc) => void>();

const notifyViewsChanged = (): void => {
  for (const listener of viewListeners) listener();
};

/** Registers a mounted editor under `key`; the last registration for a key wins. */
export function registerEditorView(key: string, view: EditorView): void {
  liveViews.set(key, view);
  notifyViewsChanged();
}

/** Drops `view` if it is still the one registered — an older unmount must not evict a remount. */
export function unregisterEditorView(key: string, view: EditorView): void {
  if (liveViews.get(key) !== view) return;
  liveViews.delete(key);
  notifyViewsChanged();
}

/** Fires whenever a view registers or unregisters. Returns the unsubscribe. */
export function subscribeEditorViews(listener: () => void): () => void {
  viewListeners.add(listener);
  return () => viewListeners.delete(listener);
}

/**
 * Announces that `key`'s surface became visible again — e.g. the phone
 * re-showing a tab editor it kept mounted under a hidden ancestor. Only
 * counts while a view is actually registered: a hidden surface whose editor
 * unmounted has nothing to answer for.
 */
export function notifyEditorVisibility(key: string): void {
  if (liveViews.has(key)) notifyViewsChanged();
}

/**
 * True while `view`'s surface is not deliberately hidden. The app marks a
 * covered surface — the phone keeps tab editors mounted under
 * `aria-hidden`/`hidden` ancestors while Home or a panel covers them — and a
 * covered scroller reports a zeroed viewport, so capturing through it would
 * overwrite the real departure position with junk. The check is `closest`,
 * not `offsetParent` or rects: hidden is *marked*, and a test DOM with no
 * layout must not read as hidden.
 */
function isEditorVisible(view: EditorView): boolean {
  return view.dom.closest('[aria-hidden="true"], [hidden]') === null;
}

/** Fires for every doc-changing transaction in a registered view. Returns the unsubscribe. */
export function subscribeEditorMapping(
  listener: (tabId: string, changes: ChangeDesc) => void
): () => void {
  mappingListeners.add(listener);
  return () => mappingListeners.delete(listener);
}

/** Called by the editor's update listener: `changes` is the transaction's ChangeSet. */
export function notifyEditorMapped(key: string, changes: ChangeDesc): void {
  for (const listener of mappingListeners) listener(key, changes);
}

/**
 * Reads the live selection and viewport of `key`'s editor, or `undefined` if
 * it is not mounted. The viewport goes in as a CodeMirror scroll snapshot —
 * the document position at the top edge plus the intra-line offset and
 * horizontal scroll — which restores exactly and maps through edits.
 */
export function captureEditorLocation(key: string): EditorLocation | undefined {
  const view = liveViews.get(key);
  if (!view || !isEditorVisible(view)) return undefined;
  const main = view.state.selection.main;
  return {
    anchor: main.anchor,
    head: main.head,
    scrollSnapshot: view.scrollSnapshot()
  };
}

/**
 * Applies `location` to `key`'s live editor: selection first, then scroll.
 *
 * Positions clamp into the current document, so a location recorded before a
 * wholesale external replacement lands inside the new text instead of
 * throwing — CodeMirror clips the stored snapshot's own target the same way.
 * Returns `false` when no live view answers — callers keep a pending restore
 * and retry once the editor mounts.
 */
export function restoreEditorLocation(
  key: string,
  location: EditorLocation,
  options?: { readonly focus?: boolean }
): boolean {
  const view = liveViews.get(key);
  // Never land a restore — or its focus grab — through a covered surface.
  if (!view || !isEditorVisible(view)) return false;
  const length = view.state.doc.length;
  const clamp = (pos: number): number => Math.max(0, Math.min(pos, length));
  const scroll =
    location.scrollSnapshot ??
    (location.scrollPos === undefined
      ? null
      : EditorView.scrollIntoView(clamp(location.scrollPos), { y: "start" }));
  view.dispatch({
    selection: { anchor: clamp(location.anchor), head: clamp(location.head) },
    ...(scroll === null ? {} : { effects: [scroll] })
  });
  if (options?.focus) view.focus();
  return true;
}

/**
 * The document offset where 1-based `line` starts in `key`'s editor, clamped
 * to the document, or `undefined` when the tab has no live view.
 */
export function editorLinePosition(key: string, line: number): number | undefined {
  const pos = editorLineTarget(key, line);
  return pos?.pos;
}

/** Generous slack around the margin `scrollIntoView` leaves above a landed target. */
const LANDED_TOLERANCE_PX = 16;

/**
 * True when `key`'s editor is already showing the place a jump to 1-based
 * `line` would produce: the caret is collapsed at the line's start *and* the
 * viewport still holds the target at its top edge.
 *
 * Both halves matter for deduping an in-file jump. A caret at the target
 * while the user scrolled elsewhere is a different place and must record;
 * checking the scroll position is what tells them apart. `coordsAtPos`
 * measures against the scroller — a folded or offscreen target answers
 * `null`, which conservatively counts as "not there".
 */
export function isEditorAtLine(key: string, line: number): boolean {
  const view = liveViews.get(key);
  const target = editorLineTarget(key, line);
  if (!view || !target || !isEditorVisible(view)) return false;
  const main = view.state.selection.main;
  if (!main.empty || main.head !== target.pos) return false;
  const targetRect = view.coordsAtPos(target.pos);
  if (!targetRect) return false;
  const scrollerRect = view.scrollDOM.getBoundingClientRect();
  // Landed at the top: the jump put the target at the viewport's top edge.
  if (Math.abs(targetRect.top - scrollerRect.top) <= LANDED_TOLERANCE_PX) return true;
  // Landed at the bottom: near the document end `scrollIntoView` clamps the
  // scroller, so a landed tail target sits *inside* the viewport instead of
  // at its top. The bottom clamp is the tell — a target merely visible
  // mid-viewport while the user scrolled elsewhere is not a landed jump.
  // (A document shorter than the viewport is always at its bottom edge.)
  const scroller = view.scrollDOM;
  const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
  return (
    atBottom &&
    targetRect.top >= scrollerRect.top &&
    targetRect.bottom <= scrollerRect.bottom
  );
}

/** `line` clamped to the document plus its start offset, for both helpers above. */
function editorLineTarget(
  key: string,
  line: number
): { readonly lineNumber: number; readonly pos: number } | undefined {
  const view = liveViews.get(key);
  if (!view) return undefined;
  const lineNumber = Math.max(1, Math.min(Math.trunc(line), view.state.doc.lines));
  return { lineNumber, pos: view.state.doc.line(lineNumber).from };
}

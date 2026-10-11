/**
 * Per-`EditorView` display controller: owns the font-size / line-wrapping
 * `Compartment`, the transform-based pinch preview, and the commit-time
 * reflow that re-lands the anchored character under the fingers.
 *
 * Three distinct entry points, deliberately:
 *
 * - `applyPreferences` — a *preference* change. Reconfigures the compartment
 *   and keeps the same reading position with a `scrollSnapshot` in the same
 *   transaction.
 * - `preview` — mid-gesture scale. A pure `transform` on `.cm-editor` (the
 *   view root): no layout change, no scroll write, no DOM churn. The
 *   transform MUST NOT land on `.cm-content` or any node inside it — any
 *   style mutation in CodeMirror's observed subtree schedules a measure,
 *   and the distorted rects produce a bogus scroll-anchor correction plus
 *   a line rebuild that detaches the touches' fixed event targets and
 *   silently kills the gesture. A transform on `view.dom` itself mutates
 *   nothing the observer watches and never triggers that cycle.
 * - `commit` — gesture end. Clears the transform, reconfigures to the real
 *   committed font size, and re-anchors the captured document position at
 *   the live midpoint through a `requestMeasure` read/write pair.
 */
import { Compartment, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { displaySettingsExtension } from "./editorDisplaySettings";
import type { PinchAnchor } from "./editorPinchZoom";

export interface EditorDisplayState {
  readonly fontSize: number;
  readonly lineWrapping: boolean;
}

export interface EditorDisplayController {
  readonly compartment: Compartment;
  /** The extension appended on mount and when a parked state rebinds. */
  extension(): Extension;
  /** Values last committed to the compartment. */
  applied(): EditorDisplayState;
  /**
   * Preference-driven reconfigure with a scroll snapshot in the same
   * transaction — used for settings changes, never mid-gesture.
   */
  applyPreferences(view: EditorView, next: EditorDisplayState): void;
  /** Applies the transform preview; `size` may be fractional. */
  preview(view: EditorView, size: number, anchor: PinchAnchor): void;
  /** Clears the transform preview and its captured origin. */
  cancelPreview(view: EditorView): void;
  /** Applies the committed size and re-lands the anchor under the fingers. */
  commit(view: EditorView, size: number, anchor: PinchAnchor): void;
}

export function createEditorDisplayController(
  initial: EditorDisplayState
): EditorDisplayController {
  const compartment = new Compartment();
  let appliedState = initial;
  /** Transform origin captured on a gesture's first preview frame. */
  let origin: { ox: number; oy: number; x0: number; y0: number } | null = null;
  /** Bumped on every cancel/commit so a stale measure can never write. */
  let generation = 0;

  const clearPreview = (view: EditorView): void => {
    origin = null;
    const root = view.dom;
    root.style.transform = "";
    root.style.transformOrigin = "";
  };

  return {
    compartment,
    extension: () => compartment.of(
      displaySettingsExtension(appliedState.fontSize, appliedState.lineWrapping)
    ),
    applied: () => appliedState,

    applyPreferences(view, next) {
      // Invalidate any queued commit measure AND clear the preview BEFORE
      // the scroll snapshot is captured — a stale write or an active
      // transform must never leak into the new layout.
      generation++;
      clearPreview(view);
      appliedState = next;
      view.dispatch({
        effects: [
          compartment.reconfigure(
            displaySettingsExtension(next.fontSize, next.lineWrapping)
          ),
          view.scrollSnapshot()
        ]
      });
    },

    preview(view, size, anchor) {
      const root = view.dom;
      if (size === appliedState.fontSize) {
        clearPreview(view);
        return;
      }
      // transform-origin lives in the view's own (untransformed) space,
      // so capture it on the first frame while no transform is applied:
      // the point under the initial midpoint.
      if (origin === null) {
        const rect = root.getBoundingClientRect();
        origin = {
          ox: anchor.startX - rect.left,
          oy: anchor.startY - rect.top,
          x0: anchor.startX,
          y0: anchor.startY
        };
      }
      const o = origin;
      root.style.transformOrigin = `${o.ox}px ${o.oy}px`;
      // Scale about the start point, then translate by the midpoint's
      // drift — the captured document point stays under the fingers.
      root.style.transform =
        `translate(${anchor.x - o.x0}px, ${anchor.y - o.y0}px) scale(${size / appliedState.fontSize})`;
    },

    cancelPreview(view) {
      generation++;
      clearPreview(view);
    },

    commit(view, size, anchor) {
      const gen = ++generation;
      // Clear the preview first so the real reflow lands clean.
      clearPreview(view);
      appliedState = { fontSize: size, lineWrapping: appliedState.lineWrapping };
      view.dispatch({
        effects: compartment.reconfigure(
          displaySettingsExtension(size, appliedState.lineWrapping)
        )
      });
      // Re-land the anchored document position at the live midpoint plus
      // its original char offset. When the pos sits outside the rendered
      // window, `scrollIntoView` — not a raw scroll to a height estimate —
      // pulls its block into the viewport: the scroll target makes the
      // viewport computation include that block, so the measure loop
      // renders it from whichever direction it truly lies. Estimate-
      // following can converge on the *estimated* top while the real
      // block still sits in a render gap — the scroll delta goes to ~0,
      // the loop dies, and the char never draws. The microtask deferral
      // exists because dispatching inside a measure write is illegal.
      // Bounded so a vanished pos can't loop.
      const target = anchor;
      const docAtCommit = view.state.doc;
      const viewRefDead = (): boolean => !view.dom.isConnected;
      let attempts = 10;
      const anchorNow = (): void => {
        view.requestMeasure({
          key: createEditorDisplayController,
          // Guard BEFORE touching coordinates: a stale generation, a dead
          // view, or a replaced doc can throw or return geometry for
          // content that no longer exists.
          read: (v): { rect: { left: number; top: number } } | { gap: true } | null => {
            if (gen !== generation || viewRefDead() || v.state.doc !== docAtCommit) {
              return null;
            }
            try {
              const rect = v.coordsAtPos(target.pos);
              if (rect !== null) return { rect };
            } catch {
              // Not laid out this cycle.
            }
            return { gap: true };
          },
          write: (res) => {
            if (res === null || gen !== generation || viewRefDead()) return;
            const s = view.scrollDOM;
            if ("rect" in res) {
              s.scrollTop += res.rect.top - (target.y + target.offsetY);
              s.scrollLeft += res.rect.left - (target.x + target.offsetX);
              return;
            }
            if (attempts-- <= 0) return;
            // `nearest`, not `center`: the scroll target keeps scrolling
            // each measure cycle until the pos is inside the viewport.
            // An in-flight one must become a no-op after the rect write
            // above lands the pos — `center` would re-scroll and undo it.
            queueMicrotask(() => {
              if (
                gen === generation &&
                !viewRefDead() &&
                view.state.doc === docAtCommit
              ) {
                view.dispatch({
                  effects: EditorView.scrollIntoView(target.pos, { y: "nearest" })
                });
              }
            });
            anchorNow();
          }
        });
      };
      view.requestMeasure({
        key: createEditorDisplayController,
        read: () => undefined,
        write: () => {
          if (gen === generation && !viewRefDead()) anchorNow();
        }
      });
    }
  };
}

/**
 * Per-`EditorView` display controller: owns the font-size / line-wrapping
 * `Compartment` so a preference change reconfigures the live view with a
 * `scrollSnapshot` in the same transaction — the reading position survives
 * the reflow and no remount is needed.
 */
import { Compartment, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { displaySettingsExtension } from "./editorDisplaySettings";

interface EditorDisplayState {
  readonly fontSize: number;
  readonly lineWrapping: boolean;
}

interface EditorDisplayController {
  /** The extension appended on mount and when a parked state rebinds. */
  extension(): Extension;
  /** Values last committed to the compartment. */
  applied(): EditorDisplayState;
  /**
   * Preference-driven reconfigure with a scroll snapshot in the same
   * transaction.
   */
  applyPreferences(view: EditorView, next: EditorDisplayState): void;
}

export function createEditorDisplayController(
  initial: EditorDisplayState
): EditorDisplayController {
  const compartment = new Compartment();
  let appliedState = initial;

  return {
    extension: () =>
      compartment.of(
        displaySettingsExtension(appliedState.fontSize, appliedState.lineWrapping)
      ),
    applied: () => appliedState,

    applyPreferences(view, next) {
      appliedState = next;
      view.dispatch({
        effects: [
          compartment.reconfigure(
            displaySettingsExtension(next.fontSize, next.lineWrapping)
          ),
          view.scrollSnapshot()
        ]
      });
    }
  };
}

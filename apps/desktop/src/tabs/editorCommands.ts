/**
 * What a tab's editable surface lets the shell chrome do to it.
 *
 * The header bar lives above the tab content and needs to reach inside
 * whichever editor is on screen — to undo or redo the working document, and
 * on merge tabs to save a resolution that is not an ordinary document save.
 * Rather than threading the CodeMirror view through three layers of props,
 * each editable surface registers what it offers under its tab id; the
 * header looks the active tab up.
 *
 * `notifyEditorCommands` bumps the subscription so button enabled-states
 * re-render — surfaces call it whenever a relevant change lands (document
 * edits and undo/redo all change the document, which is enough).
 */

import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { useSyncExternalStore } from "react";

export interface EditorCommands {
  readonly undo: () => void;
  readonly redo: () => void;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  /**
   * What Save means on this tab, when it is not the ordinary document save —
   * a merge tab's Save is "save the resolved note". Absent on editor tabs,
   * whose save the header already owns.
   */
  readonly save?: () => void;
  readonly canSave?: () => boolean;
  /**
   * True while a custom `save` is in flight, so the header can show its
   * "Saving…" state — the shell's own `isSaving` only tracks document saves.
   */
  readonly pending?: () => boolean;
  readonly saveLabel?: string;
}

interface RegisteredCommands {
  commands: EditorCommands;
  version: number;
}

const entries = new Map<string, RegisteredCommands>();
// Subscriptions are registry-wide rather than per-entry: an entry can be
// registered after a listener attached, and it would never hear about it.
const listeners = new Set<() => void>();
// Versions count up globally — a per-entry reset would make a re-register
// invisible to subscribers whose snapshot had already seen that number.
let versionSeq = 0;

const announce = (): void => {
  for (const listener of listeners) listener();
};

const subscribe = (onStoreChange: () => void): (() => void) => {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
};

/** Registers `commands` under `tabId`; the returned function unregisters. */
export function registerEditorCommands(
  tabId: string,
  commands: EditorCommands
): () => void {
  entries.set(tabId, { commands, version: ++versionSeq });
  const registration = entries.get(tabId);
  announce();
  return () => {
    // Only a still-current registration may remove itself — a remount can
    // already have replaced it, and deleting that would lose the new one.
    if (entries.get(tabId) === registration) {
      entries.delete(tabId);
      announce();
    }
  };
}

/** Tells subscribers that `tabId`'s command states may have changed. */
export function notifyEditorCommands(tabId: string): void {
  const entry = entries.get(tabId);
  if (!entry) return;
  entry.version = ++versionSeq;
  announce();
}


/**
 * Undo/redo wired to a CodeMirror view — the base of what every editable
 * surface registers. `getView` is a thunk so a surface whose view arrives
 * late (the merge diff mounts it after registration) answers for the live
 * editor, not the one that existed when it registered.
 */
export function cmHistoryCommands(
  getView: () => EditorView | null
): Pick<EditorCommands, "undo" | "redo" | "canUndo" | "canRedo"> {
  return {
    undo: () => {
      const view = getView();
      if (view && undo(view)) view.focus();
    },
    redo: () => {
      const view = getView();
      if (view && redo(view)) view.focus();
    },
    canUndo: () => {
      const view = getView();
      return view !== null && undoDepth(view.state) > 0;
    },
    canRedo: () => {
      const view = getView();
      return view !== null && redoDepth(view.state) > 0;
    }
  };
}

/** Subscribes to `tabId`'s commands, re-rendering on every notify. */
export function useEditorCommands(
  tabId: string | null | undefined
): EditorCommands | null {
  const version = useSyncExternalStore(
    subscribe,
    () => (tabId ? (entries.get(tabId)?.version ?? -1) : -1),
    // The shell's tests render to string — server snapshot required, and the
    // client answer is the right one: nothing registers during SSR anyway.
    () => (tabId ? (entries.get(tabId)?.version ?? -1) : -1)
  );
  if (!tabId || version < 0) return null;
  return entries.get(tabId)?.commands ?? null;
}

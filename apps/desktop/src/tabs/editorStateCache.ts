import type { EditorState } from "@codemirror/state";

/**
 * What an editor knew that its document does not.
 *
 * The shell keys the editor on the tab id, so switching tabs unmounts
 * CodeMirror and mounts a fresh one. The text survives because the shell holds
 * it, but the cursor, the selection, the scroll position and the undo history
 * live in the `EditorState` and the DOM, and both were thrown away on every
 * switch. Parking the state here lets the next mount pick up where the last one
 * stopped.
 *
 * States are held, not serialized: an `EditorState` is immutable and cheap to
 * keep, and round-tripping it through JSON would lose the fields whose values
 * are the whole point.
 */

export interface RememberedEditor {
  readonly state: EditorState;
  /** DOM state, so it has to be captured separately from `state`. */
  readonly scrollTop: number;
}

/**
 * Enough for any plausible working set of tabs. The cap is a backstop against a
 * leak rather than a policy: a closed tab is released by name, and a tab that
 * falls off the end only loses its cursor.
 */
const LIMIT = 24;

const remembered = new Map<string, RememberedEditor>();

export function rememberEditorState(key: string, editor: RememberedEditor): void {
  // Re-inserting moves the key to the end, so the map's own order is the
  // least-recently-parked order the cap needs.
  remembered.delete(key);
  remembered.set(key, editor);

  while (remembered.size > LIMIT) {
    const oldest = remembered.keys().next();
    if (oldest.done) break;
    remembered.delete(oldest.value);
  }
}

export function recallEditorState(key: string): RememberedEditor | undefined {
  return remembered.get(key);
}

/** Forgets a tab. A closed tab is gone, not parked. */
export function releaseEditorState(key: string): void {
  remembered.delete(key);
}

/**
 * Forgets every tab that is no longer open.
 *
 * Closing a tab unmounts its editor, and the unmount looks exactly like a
 * switch away — the editor cannot tell the difference, so the shell, which
 * knows which tabs still exist, sweeps up after it.
 */
export function releaseEditorStatesExcept(open: ReadonlySet<string>): void {
  for (const key of [...remembered.keys()]) {
    if (!open.has(key)) remembered.delete(key);
  }
}

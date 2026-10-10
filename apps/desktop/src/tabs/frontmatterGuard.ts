import {
  ChangeSet,
  EditorState,
  Transaction,
  type ChangeSpec,
  type Extension
} from "@codemirror/state";

import { findFrontmatterRange } from "./livePreview/frontmatterRange";

/**
 * Keeps delete commands issued from the body out of a hidden frontmatter
 * block.
 *
 * Live preview hides frontmatter with a line class, not an atomic range, so
 * the block stays ordinary document text. Holding Backspace at the top of the
 * body first eats the newline after the closing `---`, then the fence itself,
 * corrupting the block one keystroke at a time — invisible while it happens.
 *
 * The filter only rewrites deletions whose entire selection is past the
 * block's end. A selection that starts in or reaches into the frontmatter —
 * the cursor moved there, or a select-all from position 0 — is a deliberate
 * edit of that text and passes through untouched. Inserts are never affected.
 */
export function frontmatterGuard(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || !tr.isUserEvent("delete")) return tr;

    const doc = tr.startState.doc;
    const range = findFrontmatterRange(doc);
    if (!range) return tr;
    // The closing fence plus the newline after it: deleting that newline is
    // where held-backspace corruption begins.
    const end = Math.min(range.to + 1, doc.length);

    // Only guard deletions issued wholly from the body.
    if (!tr.startState.selection.ranges.every((r) => r.from >= end)) return tr;

    // Nothing reaching into the protected region — pass through untouched.
    let touches = false;
    tr.changes.iterChanges((fromA) => {
      if (fromA < end) touches = true;
    });
    if (!touches) return tr;

    const specs: ChangeSpec[] = [];
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      const from = Math.max(fromA, end);
      if (from >= toA && inserted.length === 0) return;
      specs.push({ from, to: toA, insert: inserted });
    });
    const changes = ChangeSet.of(specs, doc.length);
    return {
      changes,
      // Map the body selection across the clipped change; -1 keeps a cursor
      // that would land inside a deleted span at the deletion's start.
      selection: tr.startState.selection.map(changes, -1),
      userEvent: tr.annotation(Transaction.userEvent),
      scrollIntoView: true
    };
  });
}

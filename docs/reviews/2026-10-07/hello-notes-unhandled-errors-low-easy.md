# hello-notes example drops errors — the reference extension models silent failure

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/examples/extensions/hello-notes/extension.js`
- **Lines:** 225–237, 286–295, 298–300, 350–354

## Description

The sample is the document third-party authors copy, and it teaches a few
quiet-failure patterns:

1. `captureFromInput` (225–236) awaits `capture(context, body)` with a
   `try/finally` but no `catch`. With no workspace open, `createNote` throws
   "No workspace is open." — an unhandled rejection from a button click whose
   own status line says "Open a workspace to capture notes." The button could
   also just be disabled while `panel.state.rootPath` is null.
2. The capture list's click handler (298–300) calls
   `context.workspace.openNote(relativePath)` without awaiting; a rejection is
   unhandled.
3. The delete button (286–295) catches **every** `deleteNote` error and removes
   the row anyway — a permission failure looks identical to success until the
   next mount re-lists.
4. The `capture` command handler (350–354) awaits `capture` before
   `closePalette()`, so a failure leaves the palette open and the error only
   reaches the console via the shell's catch — acceptable, but worth a comment
   or a deliberate ordering.

By contrast the journal service fails loudly with typed errors and approved
copy, which is the project convention this example should demonstrate.

## Recommendation

Add minimal, visible handling so the sample teaches the right habit:

- Wrap `capture` failures in `captureFromInput` and show the message in the
  existing `.hn-status` element (or at least `console.error` it deliberately).
- Disable the Capture button when `panel.state.rootPath` is null — the status
  line already detects that state.
- In the delete handler, only remove the row on success or a known
  already-gone error; log other failures.
- `await`/`void`-with-catch the `openNote` call in the list click handler.

## Verification

Load the extension with no workspace open and click Capture: the click
produces an unhandled `Error: No workspace is open.` and no UI change, while
the panel's own status line correctly reports the missing workspace. Delete a
capture while the file is read-only: the row disappears even though the file
survives.

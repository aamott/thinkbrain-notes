# Hello Notes — example extension

The smallest useful Thinkbrain extension: one command that captures a
timestamped note through the workspace API, plus an app-event subscription
that logs every save.

An extension is a folder with two files:

- `extension.json` — the manifest. Declares identity, when to activate
  (`activationEvents`), and what it contributes. Declared commands appear in
  the command palette *before* any extension code runs; the code is only
  loaded the first time it is needed.
- `extension.js` — a plain ES module exporting `activate(context)`.

## Try it

1. Launch the app (`pnpm desktop:tauri dev`) and open a workspace.
2. Activity bar → **Extensions** → **Add from folder…** → pick this folder.
   Extensions run with full app privileges, so the app asks you to confirm.
3. `Ctrl+P` → run **Capture a note**. The extension activates, creates
   `captures/capture-<timestamp>.md`, and opens it in a tab. Its status in
   the Extensions panel flips from "Not started" to "Active".
4. Save any note (`Ctrl+S`) and check the devtools console
   (`Ctrl+Shift+I`): `[hello-notes] saved: <path>`.
5. Restart the app — the extension is still installed. Edit `extension.js`
   and press **Reload** in the Extensions panel to pick up changes.

## What the API offers today

- `context.commands.register(...)` — palette commands.
- `context.workspace` — `createNote`, `openNote`, `readNote`, scoped to the
  open workspace root.
- `context.events.on(...)` — typed app events: `note.opened`, `note.saved`,
  `note.created`, `workspace.opened`.
- `context.settings` — namespaced settings with a declared schema.

Panels declared by a disk-loaded extension are not rendered yet (the
Extensions panel reports this when it strips them); built-in extensions
already contribute panels that get their own activity-bar/title-bar icon.

This folder is loaded verbatim by an end-to-end test
(`apps/desktop/e2e/extensions.spec.ts`), so the example cannot drift from
the platform it documents.

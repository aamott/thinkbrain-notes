# Hello Notes — example extension

The smallest useful Thinkbrain extension: a command that captures a
timestamped note through the workspace API, a panel with its own place in the
activity bar, and an app-event subscription that logs every save.

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
4. Click the **✎ Capture** icon in the activity bar — the extension's own
   entry, next to Explorer and Search. Its panel is plain DOM the extension
   built itself, and the **＋** button in the panel header is an action the
   extension contributed. Each capture appears in the panel's list, because
   it is subscribed to `note.created`.
5. Save any note (`Ctrl+S`) and check the devtools console
   (`Ctrl+Shift+I`): `[hello-notes] saved: <path>`.
6. Restart the app — the extension is still installed. Edit `extension.js`
   and press **Reload** in the Extensions panel to pick up changes.

## What the API offers today

- `context.commands.register(...)` — palette commands.
- `context.panels.register({ side, mount, actions })` — a panel with its own
  icon in the activity bar (`side: "left"`) or the title bar
  (`side: "right"`), plus optional `{ id, label, icon, run }` buttons in its
  header.
- `context.workspace` — `createNote`, `openNote`, `readNote`, `writeNote`,
  `listNotes(prefix)`, scoped to the open workspace root.
- `context.tabs.register(...)` / `context.tabs.open(kind, title)` — full-canvas
  tab views of kinds your extension registered.
- `context.events.on(...)` — typed app events: `note.opened`, `note.saved`,
  `note.created`, `workspace.opened`.
- `context.settings` — namespaced settings with a declared schema.

## Why panels are DOM, not React

A built-in extension is compiled with the app and can return React from a
panel factory. An extension loaded from disk is a pre-bundled module: any
React it imported would be a *second copy* of the library, and hooks break
across that boundary. So the contract for a disk extension is
`mount(element, panel)` — you get an element, you own its contents, and you
return an optional cleanup. Use any library you like inside it, or none.

`panel.state` holds `rootPath` and `documentContents` at mount time;
`panel.onDidChange(listener)` delivers later values, since a mounted panel is
not re-invoked the way a React panel is re-rendered.

This folder is loaded verbatim by an end-to-end test
(`apps/desktop/e2e/extensions.spec.ts`), so the example cannot drift from
the platform it documents.

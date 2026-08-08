/**
 * Hello Notes — the smallest useful Thinkbrain extension.
 *
 * `activate` runs the first time something the extension declared is used:
 * the "Capture a note" command, or the Capture panel (see `activationEvents`
 * in extension.json). Everything registered through `context` is cleaned up
 * automatically when the extension is deactivated, reloaded, or removed.
 */

/** Creates a timestamped note and opens it. */
async function capture(context) {
  // Milliseconds included so two captures in the same second cannot collide.
  const stamp = new Date().toISOString().slice(0, 23).replace(/[T:.]/g, "-");
  const relativePath = `captures/capture-${stamp}.md`;
  // The workspace API is scoped to the open workspace root; parent folders
  // are created for you.
  await context.workspace.createNote(relativePath, "# Captured\n\n");
  await context.workspace.openNote(relativePath);
  return relativePath;
}

export function activate(context) {
  // App events: fires for every save in the workspace, no matter whether the
  // user, another extension, or this one triggered it.
  context.events.on("note.saved", (event) => {
    console.log(`[hello-notes] saved: ${event.relativePath}`);
  });

  context.commands.register({
    id: "capture",
    title: "Capture a note",
    availability: "available",
    handler: async ({ closePalette }) => {
      await capture(context);
      closePalette();
    }
  });

  // A panel gets its own icon in the activity bar. An extension loaded from
  // disk cannot use the app's React instance, so panels are plain DOM: you
  // are handed an element and own everything inside it.
  context.panels.register({
    id: "capture",
    label: "Capture",
    icon: "✎",
    side: "left",
    mount: (element, panel) => {
      const doc = element.ownerDocument;

      const status = doc.createElement("p");
      const render = (state) => {
        status.textContent = state.rootPath
          ? `Capturing into ${state.rootPath}`
          : "Open a workspace to capture notes.";
      };
      render(panel.state);

      // A mounted panel renders once, so this is how it hears that the
      // workspace or the open note changed.
      panel.onDidChange(render);

      // Anything the app does to the workspace shows up here, including the
      // captures this extension makes itself.
      const list = doc.createElement("ul");
      const created = context.events.on("note.created", (event) => {
        const item = doc.createElement("li");
        item.textContent = event.relativePath;
        list.append(item);
      });

      element.append(status, list);

      // Optional: undo anything that outlives the element. The element's own
      // children are discarded for you.
      return () => created.dispose();
    },
    // Buttons in the panel's own header. They are data, not markup, so they
    // look and behave like the app's own panel buttons.
    actions: [
      {
        id: "new-capture",
        label: "New capture",
        icon: "＋",
        run: () => capture(context)
      }
    ]
  });
}

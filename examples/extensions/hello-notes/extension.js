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
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
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

      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = "New capture";

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

      const onClick = () => {
        void capture(context).catch((error) => {
          status.textContent = `Capture failed: ${error.message}`;
        });
      };
      button.addEventListener("click", onClick);

      element.append(button, status);

      // Optional: undo anything that outlives the element. The element's own
      // children are discarded for you.
      return () => button.removeEventListener("click", onClick);
    }
  });
}

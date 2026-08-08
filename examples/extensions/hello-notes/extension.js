/**
 * Hello Notes — the smallest useful Thinkbrain extension.
 *
 * `activate` runs the first time the "Capture a note" command is invoked
 * (see `activationEvents` in extension.json). Everything registered through
 * `context` is cleaned up automatically when the extension is deactivated,
 * reloaded, or removed.
 */
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
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      const relativePath = `captures/capture-${stamp}.md`;
      // The workspace API is scoped to the open workspace root; parent
      // folders are created for you.
      await context.workspace.createNote(relativePath, "# Captured\n\n");
      await context.workspace.openNote(relativePath);
      closePalette();
    }
  });
}

/**
 * Hello Notes — the smallest useful Thinkbrain extension.
 *
 * `activate` runs the first time something the extension declared is used:
 * the "Capture a note" command, or the Capture panel (see `activationEvents`
 * in extension.json). Everything registered through `context` is cleaned up
 * automatically when the extension is deactivated, reloaded, or removed.
 */

/**
 * Creates a timestamped note and opens it.
 *
 * @param {object} context - The extension context.
 * @param {string} [body] - Optional Markdown body for the capture.
 * @returns {Promise<string>} The relative path of the new note.
 */
async function capture(context, body) {
  // Milliseconds included so two captures in the same second cannot collide.
  const stamp = new Date().toISOString().slice(0, 23).replace(/[T:.]/g, "-");
  const relativePath = `captures/capture-${stamp}.md`;
  const contents = body ? `# Capture\n\n${body}\n` : "# Captured\n\n";
  // The workspace API is scoped to the open workspace root; parent folders
  // are created for you.
  await context.workspace.createNote(relativePath, contents);
  await context.workspace.openNote(relativePath);
  return relativePath;
}

/**
 * Styles for the panel. A disk-loaded extension cannot use Tailwind classes
 * (those are processed at build time), so a scoped `<style>` element is the
 * cleanest way to get themed, readable CSS. Class names are `hn-` prefixed to
 * avoid collisions with the host. Colors reference the app's `--tn-color-*`
 * tokens so the panel follows the active theme automatically.
 */
const STYLES = `
.hn-root {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  font-size: 0.75rem;
  color: var(--tn-color-foreground);
  height: 100%;
  overflow-y: auto;
}
.hn-status {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border-radius: var(--tn-radius-small);
  background: var(--tn-color-surface);
  color: var(--tn-color-surface-foreground);
  font-size: 0.7rem;
  font-weight: 600;
}
.hn-status--empty {
  color: var(--tn-color-muted-foreground);
  font-weight: 400;
}
.hn-input-row {
  display: flex;
  gap: 0.25rem;
  align-items: stretch;
}
.hn-input {
  flex: 1;
  min-width: 0;
  resize: vertical;
  max-height: 8rem;
  min-height: 2.5rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--tn-color-input);
  border-radius: var(--tn-radius-small);
  background: var(--tn-color-background);
  color: var(--tn-color-foreground);
  font: inherit;
  font-size: 0.75rem;
  line-height: 1.4;
}
.hn-input:focus {
  outline: 2px solid var(--tn-color-ring);
  outline-offset: -1px;
}
.hn-capture-btn {
  flex-shrink: 0;
  padding: 0 0.75rem;
  border: none;
  border-radius: var(--tn-radius-small);
  background: var(--tn-color-primary);
  color: var(--tn-color-primary-foreground);
  font: inherit;
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.hn-capture-btn:hover {
  filter: brightness(1.1);
}
.hn-capture-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.hn-section-label {
  margin: 0;
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--tn-color-muted-foreground);
}
.hn-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.hn-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--tn-radius-small);
  background: var(--tn-color-surface);
  cursor: pointer;
}
.hn-item:hover {
  background: var(--tn-color-accent);
}
.hn-item-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.7rem;
}
.hn-delete {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--tn-radius-small);
  background: transparent;
  color: var(--tn-color-muted-foreground);
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1;
}
.hn-delete:hover {
  background: var(--tn-color-danger);
  color: var(--tn-color-danger-foreground);
}
.hn-empty {
  margin: 0;
  padding: 0.75rem;
  text-align: center;
  color: var(--tn-color-muted-foreground);
  font-size: 0.7rem;
}
`;

/**
 * Builds the panel DOM inside the given element.
 *
 * @param {HTMLElement} element - The host element to mount into.
 * @param {object} panel - The panel mount context ({ state, onDidChange }).
 * @param {object} context - The extension context.
 * @returns {() => void} Cleanup for event subscriptions.
 */
function mountPanel(element, panel, context) {
  const doc = element.ownerDocument;

  // Inject styles once. Using a <style> element keeps the markup readable and
  // lets us use :hover and theme tokens — neither is possible with inline styles.
  const style = doc.createElement("style");
  style.textContent = STYLES;
  element.append(style);

  const root = doc.createElement("div");
  root.className = "hn-root";
  element.append(root);

  // --- Status line -------------------------------------------------------
  const status = doc.createElement("p");
  status.className = "hn-status";
  root.append(status);

  const renderStatus = (state) => {
    if (state.rootPath) {
      status.textContent = `Capturing into ${state.rootPath}`;
      status.className = "hn-status";
    } else {
      status.textContent = "Open a workspace to capture notes.";
      status.className = "hn-status hn-status--empty";
    }
  };
  renderStatus(panel.state);
  panel.onDidChange(renderStatus);

  // --- Inline capture input ---------------------------------------------
  const inputRow = doc.createElement("div");
  inputRow.className = "hn-input-row";
  root.append(inputRow);

  const input = doc.createElement("textarea");
  input.className = "hn-input";
  input.placeholder = "Type to capture…";
  input.setAttribute("aria-label", "Capture text");
  inputRow.append(input);

  const captureBtn = doc.createElement("button");
  captureBtn.type = "button";
  captureBtn.className = "hn-capture-btn";
  captureBtn.textContent = "Capture";
  captureBtn.setAttribute("aria-label", "Capture typed text");
  inputRow.append(captureBtn);

  /** Captures the textarea content and clears the input. */
  const captureFromInput = async () => {
    const body = input.value.trim();
    if (!body) return;
    captureBtn.disabled = true;
    try {
      await capture(context, body);
      input.value = "";
    } finally {
      captureBtn.disabled = false;
      input.focus();
    }
  };
  captureBtn.addEventListener("click", captureFromInput);
  // Ctrl/Cmd+Enter submits from the textarea.
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      captureFromInput();
    }
  });

  // --- Captures list -----------------------------------------------------
  const label = doc.createElement("p");
  label.className = "hn-section-label";
  label.textContent = "Recent captures";
  root.append(label);

  const list = doc.createElement("ul");
  list.className = "hn-list";
  root.append(list);

  const empty = doc.createElement("p");
  empty.className = "hn-empty";
  empty.textContent = "No captures yet.";
  root.append(empty);

  /** @type {Set<string>} Paths currently shown, newest first. */
  const paths = new Set();

  /** Rebuilds the list DOM from the `paths` set. */
  const renderList = () => {
    list.replaceChildren();
    empty.style.display = paths.size === 0 ? "" : "none";
    for (const relativePath of paths) {
      const item = doc.createElement("li");
      item.className = "hn-item";

      // The path text is the list item's text content. Clicking opens the note.
      const pathSpan = doc.createElement("span");
      pathSpan.className = "hn-item-path";
      pathSpan.textContent = relativePath;
      item.append(pathSpan);

      // Delete button: SVG-only so the list item's textContent stays just the
      // path (the e2e test asserts exact text on the <li>).
      const del = doc.createElement("button");
      del.type = "button";
      del.className = "hn-delete";
      del.setAttribute("aria-label", `Delete ${relativePath}`);
      del.innerHTML =
        '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
      del.addEventListener("click", async (event) => {
        event.stopPropagation();
        try {
          await context.workspace.deleteNote(relativePath);
        } catch {
          // If the file is already gone, just remove it from the list.
        }
        paths.delete(relativePath);
        renderList();
      });
      item.append(del);

      item.addEventListener("click", () => {
        context.workspace.openNote(relativePath);
      });

      list.append(item);
    }
  };

  // Load existing captures on mount. The workspace API is available from the
  // closure; listNotes returns notes in a folder, matched as a folder prefix.
  const loadExisting = async () => {
    try {
      const notes = await context.workspace.listNotes("captures");
      // Newest first: listNotes returns entries in enumeration order, which is
      // not guaranteed sorted, so reverse for a rough recency display.
      for (const note of notes.reverse()) {
        paths.add(note.relativePath);
      }
      renderList();
    } catch {
      // No workspace or not ready yet — the list stays empty.
    }
  };
  loadExisting();

  // Anything the app does to the workspace shows up here, including the
  // captures this extension makes itself. New captures go to the top.
  const created = context.events.on("note.created", (event) => {
    if (!event.relativePath.startsWith("captures/")) return;
    paths.delete(event.relativePath);
    paths.add(event.relativePath);
    renderList();
  });

  renderList();

  // Optional: undo anything that outlives the element. The element's own
  // children are discarded for you.
  return () => created.dispose();
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
    mount: (element, panel) => mountPanel(element, panel, context),
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

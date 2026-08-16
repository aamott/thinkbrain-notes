import { WidgetType, type EditorView } from "@codemirror/view";

/**
 * An interactive checkbox standing in for a `[ ]` / `[x]` task marker.
 *
 * Clicking dispatches a one-character document change rather than mutating any
 * widget state, so the document stays the single source of truth and the
 * change lands in the undo history like any other edit.
 */
export class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    /** Document offset of the `[` opening the marker. */
    private readonly pos: number
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-task-checkbox-wrap";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-task-checkbox";
    input.checked = this.checked;
    input.setAttribute(
      "aria-label",
      this.checked ? "Mark task incomplete" : "Mark task complete"
    );

    // Keep focus in the editor so clicking a checkbox never moves the cursor.
    input.addEventListener("mousedown", (event) => event.preventDefault());
    input.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        changes: {
          from: this.pos + 1,
          to: this.pos + 2,
          insert: this.checked ? " " : "x"
        }
      });
    });

    wrap.appendChild(input);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * An inline image rendered in place of its Markdown source.
 *
 * On load failure the widget swaps itself for the alt text rather than leaving
 * a broken-image glyph, so a missing asset reads as prose instead of damage.
 */
export class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-image-wrap";

    const img = document.createElement("img");
    img.className = "cm-image";
    img.src = this.src;
    img.alt = this.alt;
    img.addEventListener("error", () => {
      wrap.textContent = this.alt;
      wrap.className = "cm-image-text";
      console.error(`[livePreview] image failed to load: ${this.src}`);
    });

    wrap.appendChild(img);
    return wrap;
  }
}

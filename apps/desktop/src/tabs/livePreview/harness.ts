import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { livePreview } from "./index";
import type { LivePreviewOptions } from "./options";
import { wikiLinkExtension } from "./wikiLink";

/**
 * Test-only helper that mounts a real `EditorView` and reads back what the
 * user would actually see.
 *
 * Asserting on rendered DOM rather than on decoration ranges is deliberate:
 * it is the only way to catch concealment that computes correctly but renders
 * wrong. Deliberately not named `*.test.ts` so vitest does not collect it.
 */
export interface PreviewHandle {
  readonly view: EditorView;
  /** Visible text of a 1-based line, with concealed characters removed. */
  lineText(lineNumber: number): string;
  /** Space-joined class list of a 1-based line's DOM element. */
  lineClass(lineNumber: number): string;
  setCursor(pos: number): void;
  destroy(): void;
}

export function mountPreview(
  source: string,
  cursor = 0,
  options: LivePreviewOptions = {}
): PreviewHandle {
  const parent = document.createElement("div");
  document.body.appendChild(parent);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      selection: { anchor: cursor },
      extensions: [
        markdown({ base: markdownLanguage, extensions: [wikiLinkExtension] }),
        EditorView.lineWrapping,
        livePreview(options)
      ]
    })
  });

  const lineElement = (lineNumber: number): HTMLElement => {
    const line = view.state.doc.line(lineNumber);
    const node = view.domAtPos(line.from).node;
    const host = node instanceof HTMLElement ? node : node.parentElement;
    const found = host?.closest(".cm-line");
    if (!(found instanceof HTMLElement)) {
      throw new Error(`No rendered line found for line ${lineNumber}`);
    }
    return found;
  };

  return {
    view,
    lineText: (lineNumber) => lineElement(lineNumber).textContent ?? "",
    lineClass: (lineNumber) => lineElement(lineNumber).className,
    setCursor: (pos) => view.dispatch({ selection: { anchor: pos } }),
    destroy: () => {
      view.destroy();
      parent.remove();
    }
  };
}

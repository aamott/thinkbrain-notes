import { syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate
} from "@codemirror/view";

import { buildDecorations } from "./decorate";
import type { LivePreviewOptions } from "./options";
import { livePreviewTheme } from "./theme";

export type { LivePreviewOptions } from "./options";

/**
 * Renders Markdown formatted inline, revealing raw source only for the
 * construct the cursor is inside.
 *
 * A `ViewPlugin` rather than a `StateField` because the decorations depend on
 * the selection and the viewport, neither of which a state field can observe.
 */
export function livePreview(options: LivePreviewOptions = {}): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      atomic: DecorationSet;

      constructor(view: EditorView) {
        const built = buildDecorations(view, options);
        this.decorations = built.content;
        this.atomic = built.atomic;
      }

      update(update: ViewUpdate) {
        // The tree comparison is not optional. CodeMirror parses large
        // documents incrementally, and the background work that finishes the
        // parse arrives as transactions that change neither the document, the
        // selection, nor the viewport. Without this check a long note renders
        // whatever had been parsed when it opened and never catches up.
        const reparsed = syntaxTree(update.startState) !== syntaxTree(update.state);
        if (
          !update.docChanged &&
          !update.selectionSet &&
          !update.viewportChanged &&
          !reparsed
        ) {
          return;
        }
        const built = buildDecorations(update.view, options);
        this.decorations = built.content;
        this.atomic = built.atomic;
      }
    },
    {
      decorations: (value) => value.decorations,
      provide: (plugin) =>
        EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none)
    }
  );

  return [plugin, livePreviewTheme];
}

import { syntaxTree } from "@codemirror/language";
import { resolveWikiLinkTarget } from "@thinkbrain/core";
import type { Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import { buildDecorations } from "./decorate";
import { extractWikiLinkTarget } from "./nodes/links";
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
      decorations!: DecorationSet;
      atomic!: DecorationSet;

      constructor(view: EditorView) {
        this.rebuild(view);
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
        this.rebuild(update.view);
      }

      private rebuild(view: EditorView) {
        const built = buildDecorations(view, options);
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

  // Click handler for resolved wiki links. Uses `domEventHandlers` rather than
  // per-decoration widgets so a single listener covers every `[[Target]]` in the
  // document. The handler walks up from the click target to find a
  // `cm-link-resolved` element, resolves the target at the clicked position,
  // and calls `onOpenNote` with the vault-relative path.
  const clickHandler = options.onOpenNote
    ? EditorView.domEventHandlers({
        click: (event, view) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;

          const resolvedEl = target.closest(".cm-link-resolved");
          if (!resolvedEl) return false;

          const pos = view.posAtDOM(resolvedEl);
          const tree = syntaxTree(view.state);

          // Walk up from the clicked position to find the enclosing WikiLink
          // node. `tree.resolve` returns the deepest leaf; `parent` chains up.
          let node: SyntaxNode | null = tree.resolve(pos, 1);
          while (node && node.name !== "WikiLink") {
            node = node.parent;
          }
          if (!node || node.name !== "WikiLink") return false;

          // Extract the target string from the WikiLink node.
          const targetText = extractWikiLinkTarget(node, view.state.doc);
          if (!targetText) return false;

          const resolvedPath = resolveWikiLinkTarget(targetText, options.noteIndex ?? []);
          if (!resolvedPath || !options.onOpenNote) return false;

          options.onOpenNote(resolvedPath);
          event.preventDefault();
          return true;
        }
      })
    : [];

  return [plugin, clickHandler, livePreviewTheme];
}

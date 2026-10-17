import { syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate
} from "@codemirror/view";

import { buildDecorations } from "./decorate";
import { linkFollowHandlers, linkNodeAt, linkTargetAt } from "./linkInteraction";
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
  // Keyboard follow, shared by both modes: when the cursor is inside a link
  // node, `Mod-Enter` (Cmd/Ctrl+Enter) follows it. Returning `true` consumes
  // the keypress so the editor does not also insert a newline; `false` lets
  // it pass through when the cursor is not on a link.
  const keyHandler = options.onOpenLink
    ? keymap.of([
        {
          key: "Mod-Enter",
          run: (view) => openLinkAt(view, view.state.selection.main.head, options)
        }
      ])
    : [];

  // Source mode: syntax is always visible, so only Mod+click and Mod-Enter
  // follow — a plain click is always an edit gesture and passes through.
  if (options.sourceMode) {
    return options.onOpenLink
      ? [
          EditorView.domEventHandlers({
            click: (event, view) => {
              if (!event.ctrlKey && !event.metaKey) return false;
              const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
              if (pos === null || !openLinkAt(view, pos, options)) return false;
              event.preventDefault();
              return true;
            }
          }),
          keyHandler
        ]
      : [];
  }

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

  return [plugin, linkFollowHandlers(options), keyHandler, livePreviewTheme];
}

/**
 * Resolves the link at `pos` and hands it to `onOpenLink` — wiki links
 * through the note index, `[text](target)` links as internal vault paths or
 * external URLs. Returns true if handled.
 */
function openLinkAt(view: EditorView, pos: number, options: LivePreviewOptions): boolean {
  const node = linkNodeAt(view, pos);
  if (!node || !options.onOpenLink) return false;

  const resolved = linkTargetAt(node, view, options);
  if (!resolved) return false;
  options.onOpenLink(resolved);
  return true;
}

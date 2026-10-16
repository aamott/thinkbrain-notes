import { syntaxTree } from "@codemirror/language";
import { resolveWikiLinkTarget } from "@thinkbrain/core";
import type { Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import { buildDecorations } from "./decorate";
import { extractWikiLinkTarget } from "./nodes/links";
import type { LivePreviewOptions } from "./options";
import { selectionTouchesRange } from "./reveal";
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
  //
  // Reveal state is sampled at `mousedown`, not `click`: CodeMirror moves the
  // cursor into the link on mousedown, so by click time the selection always
  // touches it. `press` remembers which link the press started on and whether
  // its syntax was still hidden. A press on a concealed link follows; a press
  // on a revealed link edits unless Mod is held — Mod+click follows either way.
  let press: { from: number; to: number; revealed: boolean } | null = null;
  const clickHandler = options.onOpenNote
    ? EditorView.domEventHandlers({
        // `pointerdown` rather than `mousedown`: it covers touch taps too, and
        // it still fires before CodeMirror moves the cursor into the link.
        pointerdown: (event, view) => {
          press = null;
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;

          const resolvedEl = target.closest(".cm-link-resolved");
          if (!(resolvedEl instanceof HTMLElement)) return false;

          const node = wikiLinkNodeAt(view, view.posAtDOM(resolvedEl));
          if (!node) return false;

          press = {
            from: node.from,
            to: node.to,
            revealed: selectionTouchesRange(view.state, node.from, node.to)
          };
          return false;
        },
        click: (event, view) => {
          const start = press;
          press = null;
          const target = event.target;
          if (!(target instanceof HTMLElement) || !start) return false;

          const resolvedEl = target.closest(".cm-link-resolved");
          if (!(resolvedEl instanceof HTMLElement)) return false;

          const pos = view.posAtDOM(resolvedEl);
          const node = wikiLinkNodeAt(view, pos);
          // The release has to land on the same link the press started on —
          // a drag that merely ends over a link is a selection gesture.
          if (!node || node.from !== start.from || node.to !== start.to) return false;
          if (start.revealed && !event.ctrlKey && !event.metaKey) return false;

          if (!openWikiLinkAt(view, pos, options)) return false;
          event.preventDefault();
          return true;
        }
      })
    : [];

  // Keyboard follow for resolved wiki links. Mirrors the click handler: when
  // the cursor is inside a `WikiLink` node, `Mod-Enter` (Cmd/Ctrl+Enter)
  // resolves the target and calls `onOpenNote`. Returning `true` consumes the
  // keypress so the editor does not also insert a newline; `false` lets it pass
  // through when the cursor is not on a wiki link.
  const keyHandler = options.onOpenNote
    ? keymap.of([
        {
          key: "Mod-Enter",
          run: (view) => openWikiLinkAt(view, view.state.selection.main.head, options)
        }
      ])
    : [];

  return [plugin, clickHandler, keyHandler, livePreviewTheme];
}

/** The `WikiLink` syntax node containing `pos`, or `null`. */
function wikiLinkNodeAt(view: EditorView, pos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(view.state).resolve(pos, 1);
  while (node && node.name !== "WikiLink") node = node.parent;
  return node && node.name === "WikiLink" ? node : null;
}

/** Resolves a wiki link at `pos` and calls `onOpenNote`. Returns true if handled. */
function openWikiLinkAt(view: EditorView, pos: number, options: LivePreviewOptions): boolean {
  const node = wikiLinkNodeAt(view, pos);
  if (!node) return false;
  const targetText = extractWikiLinkTarget(node, view.state.doc);
  if (!targetText) return false;
  const resolvedPath = resolveWikiLinkTarget(targetText, options.noteIndex ?? []);
  if (!resolvedPath || !options.onOpenNote) return false;
  options.onOpenNote(resolvedPath);
  return true;
}

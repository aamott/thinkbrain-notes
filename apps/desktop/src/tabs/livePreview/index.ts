import { syntaxTree } from "@codemirror/language";
import { resolveMarkdownLinkTarget, resolveWikiLinkTarget } from "@thinkbrain/core";
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

  // Click handler for resolved wiki and Markdown links. Uses `domEventHandlers`
  // rather than per-decoration widgets so a single listener covers every link
  // in the document. The handler walks up from the click target to find a
  // `cm-link-resolved` element, resolves the target at the clicked position,
  // and dispatches to the matching open callback.
  //
  // Reveal state is sampled at `pointerdown`, not `click`: CodeMirror moves the
  // cursor into the link on press, so by click time the selection always
  // touches it. `press` remembers which link the press started on and whether
  // its syntax was still hidden. A press on a concealed link follows; a press
  // on a revealed link edits unless Mod is held — Mod+click follows either way.
  let press: { from: number; to: number; revealed: boolean } | null = null;
  const clickHandler = options.onOpenLink
    ? EditorView.domEventHandlers({
        // `pointerdown` rather than `mousedown`: it covers touch taps too, and
        // it still fires before CodeMirror moves the cursor into the link.
        pointerdown: (event, view) => {
          press = null;
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;

          const resolvedEl = target.closest(".cm-link-resolved");
          if (!(resolvedEl instanceof HTMLElement)) return false;

          const node = linkNodeAt(view, view.posAtDOM(resolvedEl));
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
          const node = linkNodeAt(view, pos);
          // The release has to land on the same link the press started on —
          // a drag that merely ends over a link is a selection gesture.
          if (!node || node.from !== start.from || node.to !== start.to) return false;
          if (start.revealed && !event.ctrlKey && !event.metaKey) return false;

          if (!openLinkAt(view, pos, options)) return false;
          event.preventDefault();
          return true;
        }
      })
    : [];

  return [plugin, clickHandler, keyHandler, livePreviewTheme];
}

/** The `WikiLink` or `Link` syntax node containing `pos`, or `null`. */
function linkNodeAt(view: EditorView, pos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(view.state).resolve(pos, 1);
  while (node && node.name !== "WikiLink" && node.name !== "Link") node = node.parent;
  return node;
}

/**
 * Resolves the link at `pos` and hands it to `onOpenLink` — wiki links
 * through the note index, `[text](target)` links as internal vault paths or
 * external URLs. Returns true if handled.
 */
function openLinkAt(view: EditorView, pos: number, options: LivePreviewOptions): boolean {
  const node = linkNodeAt(view, pos);
  if (!node || !options.onOpenLink) return false;

  const resolved =
    node.name === "WikiLink"
      ? wikiLinkTargetAt(node, view, options)
      : markdownLinkTargetAt(node, view, options);
  if (!resolved) return false;
  options.onOpenLink(resolved);
  return true;
}

/** The vault-relative path a `WikiLink` node resolves to, or `null`. */
function wikiLinkTargetAt(
  node: SyntaxNode,
  view: EditorView,
  options: LivePreviewOptions
): { kind: "internal"; relativePath: string } | null {
  const targetText = extractWikiLinkTarget(node, view.state.doc);
  if (!targetText) return null;
  const relativePath = resolveWikiLinkTarget(targetText, options.noteIndex ?? []);
  return relativePath ? { kind: "internal", relativePath } : null;
}

/** The target a `Link` node's URL child resolves to, or `null`. */
function markdownLinkTargetAt(node: SyntaxNode, view: EditorView, options: LivePreviewOptions) {
  const urlNode = node.getChild("URL");
  if (!urlNode) return null;
  return resolveMarkdownLinkTarget(
    view.state.doc.sliceString(urlNode.from, urlNode.to),
    options.relativePath,
    options.noteIndex ?? []
  );
}

import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  type WidgetType
} from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import { parseFrontmatter } from "@thinkbrain/core";

import { findFrontmatterRange } from "./frontmatterRange";
import { selectionTouchesRange } from "./reveal";
import { handlers } from "./handlers";
import type { LivePreviewOptions } from "./options";

/**
 * Builds the two decoration sets that drive live preview.
 *
 * `content` carries everything the user sees: line classes, inline mark
 * classes, widgets, and the `replace` decorations that conceal syntax
 * characters. `atomic` carries only the concealments, and is handed to
 * `EditorView.atomicRanges` so arrow keys step over invisible characters
 * instead of appearing to stall on them.
 */

/** What a node handler is given to describe one construct. */
export interface DecorateContext {
  readonly state: EditorState;
  readonly options: LivePreviewOptions;
  /** Adds an always-visible decoration. Line decorations must use `from === to`. */
  readonly present: (deco: Decoration, from: number, to: number) => void;
  /**
   * Conceals `[from, to)` unless `revealed`.
   *
   * When revealed the characters stay visible but are dimmed, so the user can
   * see they are markup rather than prose.
   */
  readonly conceal: (from: number, to: number, revealed: boolean) => void;
  /** Replaces `[from, to)` with a widget, always — widgets never conceal. */
  readonly replaceWith: (from: number, to: number, widget: WidgetType) => void;
}

/** Decorates one syntax-tree node. Handlers are registered by node name. */
export type NodeHandler = (node: SyntaxNodeRef, ctx: DecorateContext) => void;

const SYNTAX_MARK = Decoration.mark({ class: "cm-syntax-mark" });
const CONCEALED = Decoration.replace({});

export interface LivePreviewDecorations {
  readonly content: DecorationSet;
  readonly atomic: DecorationSet;
}

export function buildDecorations(
  view: EditorView,
  options: LivePreviewOptions
): LivePreviewDecorations {
  const { state } = view;
  const content: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];

  const ctx: DecorateContext = {
    state,
    options,
    present: (deco, from, to) => {
      if (from <= to) content.push(deco.range(from, to));
    },
    conceal: (from, to, revealed) => {
      if (from >= to) return;
      if (revealed) {
        content.push(SYNTAX_MARK.range(from, to));
        return;
      }
      content.push(CONCEALED.range(from, to));
      atomic.push(CONCEALED.range(from, to));
    },
    replaceWith: (from, to, widget) => {
      if (from >= to) return;
      const deco = Decoration.replace({ widget });
      content.push(deco.range(from, to));
      atomic.push(deco.range(from, to));
    }
  };

  const frontmatter = findFrontmatterRange(state.doc);
  if (frontmatter) {
    // D88: the same bargain every other piece of syntax gets — hidden while you
    // read, shown when the cursor arrives. A block that will not parse is never
    // hidden: it is the evidence behind the diagnostic telling you it is broken.
    const revealed = selectionTouchesRange(state, frontmatter.from, frontmatter.to);
    const readable =
      parseFrontmatter(state.doc.sliceString(frontmatter.from, frontmatter.to + 1)).diagnostics
        .length === 0;
    // Hidden a line at a time rather than by replacing the range: a plugin's
    // decorations may not replace line breaks, and a line class leaves the
    // document untouched, which is the whole promise of live preview.
    decorateFrontmatter(frontmatter.lastLine, ctx, revealed || !readable);
  }

  // Decorate a single span covering every visible range rather than iterating
  // each range separately: a node straddling two ranges would otherwise be
  // decorated twice and produce duplicate replace decorations.
  const first = view.visibleRanges.at(0);
  const last = view.visibleRanges.at(-1);
  const from = first?.from ?? 0;
  // A freshly mounted (or headless) view can report an empty or zero-height
  // viewport. Falling back to the whole document keeps the first paint correct
  // rather than briefly showing raw Markdown.
  const to = last && last.to > from ? last.to : state.doc.length;

  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      // Frontmatter is styled as data; the Markdown parser's reading of it is
      // wrong by construction, so nothing inside it gets Markdown decoration.
      if (frontmatter && node.from < frontmatter.to) return true;
      handlers[node.name]?.(node, ctx);
      return true;
    }
  });

  return {
    content: Decoration.set(content, true),
    atomic: Decoration.set(atomic, true)
  };
}

/**
 * Styles every frontmatter line as a dimmed monospace data block, or hides it.
 *
 * `shown` is false in the ordinary reading case (D88); the lines keep their
 * class so the block is still one styled object the moment it comes back.
 */
function decorateFrontmatter(lastLine: number, ctx: DecorateContext, shown: boolean): void {
  for (let lineNumber = 1; lineNumber <= lastLine; lineNumber++) {
    const line = ctx.state.doc.line(lineNumber);
    const edge =
      lineNumber === 1
        ? " cm-frontmatter-first"
        : lineNumber === lastLine
          ? " cm-frontmatter-last"
          : "";
    const hidden = shown ? "" : " cm-frontmatter-hidden";
    ctx.present(
      Decoration.line({ class: `cm-frontmatter${edge}${hidden}` }),
      line.from,
      line.from
    );
  }
}

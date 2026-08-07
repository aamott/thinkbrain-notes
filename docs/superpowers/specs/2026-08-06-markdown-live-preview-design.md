# Markdown Live Preview Editor — Design

**Date:** 2026-08-06
**Story:** `plans/ui-shell/pending-semi_preview_editor-med-hard.md`

## Goal

Replace plain-text Markdown editing with a semi-preview mode: markdown renders
formatted inline, and the raw source is revealed only for the construct the
cursor is inside. `## hello` displays as an H2 reading "hello"; put the cursor
on it and it reads `## hello`, still styled as an H2.

The document is never modified. Concealment is purely visual, so undo/redo,
saving, and git diffs all see untouched raw markdown.

## Approach

Three options were considered:

1. **`StateField` of decorations** mapped incrementally through document
   changes.
2. **`ViewPlugin`** that recomputes decorations from the syntax tree.
3. **Hybrid** — `StateField` for stable structure, `ViewPlugin` for the
   cursor-dependent reveal layer.

**Chosen: option 2.** Decorations here depend on the selection and the
viewport, neither of which a `StateField` can observe. Recomputing over the
visible range only is cheap, so incremental mapping buys complexity without
performance. Recompute triggers on `docChanged || selectionSet ||
viewportChanged`.

## Module layout

Everything lives in `apps/desktop/src/tabs/livePreview/` and imports no Tauri
APIs — host capability arrives through an injected options object, per the
layer separation rule in `AGENTS.md`.

| File | Responsibility |
| --- | --- |
| `index.ts` | `livePreview(options)` → assembles the `Extension[]`. The only public entry point. |
| `options.ts` | `LivePreviewOptions` type, including `resolveAssetUrl`. |
| `reveal.ts` | Pure predicates: does the selection touch this node / this line? No view access. |
| `decorate.ts` | Walks the syntax tree over visible ranges, dispatching to node handlers. |
| `nodes/headings.ts` | ATX heading line classes and `HeaderMark` concealment. |
| `nodes/emphasis.ts` | Bold, italic, strikethrough. |
| `nodes/links.ts` | Links, images, wiki-link decoration. |
| `nodes/lists.ts` | Bullet/ordered list marks, task markers. |
| `nodes/code.ts` | Inline code, fenced code block lines and fences. |
| `nodes/frontmatter.ts` | YAML frontmatter block styling. |
| `nodes/blocks.ts` | Blockquotes, horizontal rules. |
| `widgets.ts` | `TaskCheckboxWidget`, `ImageWidget`. |
| `wikiLink.ts` | Lezer inline parser for `[[Target\|alias]]`. |
| `theme.ts` | `EditorView.theme` built from `--tn-*` tokens. |

Each node handler has the signature `(node: SyntaxNodeRef, ctx: DecorateContext)
=> void` and pushes into the context's decoration builders. `decorate.ts` stays
a dispatcher rather than a long switch, and each handler is independently
testable.

## Decoration engine

For each visible range, walk the syntax tree. Every construct contributes two
kinds of decoration:

- **Presentation** — line and mark decorations (`cm-h2`, `cm-strong`,
  `cm-quote-line`, …) that are *always* applied.
- **Concealment** — `Decoration.replace({})` over the syntax characters,
  applied only when the selection is not touching them.

Concealed ranges are additionally registered through `EditorView.atomicRanges`
so cursor motion steps over them rather than sticking on invisible characters.

## Reveal rules

Reveal is **per-node**, not per-line:

- **Inline constructs** (`**bold**`, `` `code` ``, `[link](url)`,
  `[[wiki]]`, `~~strike~~`) reveal their markers when the selection overlaps
  that node's range.
- **Block constructs** (`##`, `>`, `-`, ` ``` `, `---`) reveal when the
  selection touches that line. A line-leading marker has no meaningful
  "inside" for a cursor to occupy.
- **Selections spanning multiple lines** reveal every node they overlap,
  satisfying the story's multi-line acceptance criterion.

## Feature coverage

| Construct | Rendering |
| --- | --- |
| Headings `#`–`######` | Line classes `cm-h1`…`cm-h6` sizing via `--tn-*` type scale; `HeaderMark` plus its trailing space concealed. |
| Bold / italic / strikethrough | `font-weight`, `font-style`, `line-through`; `EmphasisMark` / `StrikethroughMark` concealed. |
| Inline code | Monospace with a subtle background; backticks concealed. |
| Links | Link text styled as an accent-colored link; `[`, `](url)` concealed. |
| Wiki links `[[Target]]` | Custom lezer inline parser; renders as link text with `[[`/`]]` and any `\|alias` target concealed. |
| Images | Real `<img>` widget. `http(s)` loaded directly; vault-relative paths resolved through the injected `resolveAssetUrl`. Styled alt-text on load failure or when no resolver is supplied. |
| Blockquotes | Left border and muted italic per line; `QuoteMark` concealed. |
| Lists | Bullet/number marks styled, not concealed — they carry meaning. |
| Task checkboxes | `TaskMarker` replaced with a real interactive checkbox widget; clicking dispatches a one-character document change. |
| Fenced code | Monospace block with background and rounded first/last lines; lazy per-language highlighting via `@codemirror/language-data`. Opening/closing fences concealed. |
| Horizontal rules | Rendered as a CSS rule line; `---` concealed. |
| Frontmatter | Dimmed monospace bordered block. **Never concealed.** |
| Tables | Header and alignment styling only; grid rendering is out of scope. Requires the GFM table extension in the `markdown()` base config. |

### Explicitly out of scope

- **Link navigation.** Clicking a link or wiki link does not open anything.
  This story renders markdown; resolving a `[[Target]]` to a workspace file and
  opening it is separate work with its own resolution rules.
- **Table grid rendering.**
- **Collaborative editing** interactions, which do not exist yet.

### Frontmatter

Notes keep YAML frontmatter in the document text (`PropertiesPanel` parses it
out of `contents`). The stock markdown parser does not know frontmatter: it
reads the opening `---` as a horizontal rule and the closing `---` as a setext
underline, so `title: My Note` currently renders as a giant H2. Adding the
frontmatter parser extension fixes this mis-parse. The block is then styled as
structured data and never conceals, because it is data rather than prose.

### Typography

The editor switches from `font-mono` to the proportional `--tn-font-sans`, with
monospace retained for inline code and fenced blocks. This is a deliberate
visual change to how every note renders.

## Toggle

- `editor.livePreview` — boolean, default `true` — added to the existing
  Editor settings module in `packages/core/src/settings/modules/editor.ts`.
- A **"Toggle live preview"** command registered in the command palette.

`MarkdownEditor` consumes the setting through a CodeMirror `Compartment`, so
toggling reconfigures the extension in place without losing cursor position,
scroll offset, or undo history. This introduces the first wiring of editor
settings into `MarkdownEditor`; the same plumbing is reusable for the
already-defined but currently unconsumed `fontSize` and `lineWrapping`
settings.

## Demo page

`apps/desktop/demo/live-preview.html` + `demo/main.tsx` import the **real**
`livePreview/` modules and are served by the existing dev server at
`/demo/live-preview.html`. The demo passes a remote-only asset resolver, so it
needs no Tauri — which matters because `pnpm dev` alone cannot open a workspace
file. The demo cannot drift from shipped behavior, since it is the same code.
It is excluded from the production build.

## Testing

- **`reveal.ts`** — pure unit tests over selection/range combinations.
- **Node handlers** — vitest + happy-dom, mounting a real `EditorView` and
  asserting rendered DOM. Core assertion pair: line 1 reads `hello` with class
  `cm-h2` when the cursor is elsewhere, and reads `## hello` while still
  classed `cm-h2` when the cursor is on it.
- **Document integrity** — assert `state.doc.toString()` is byte-identical to
  the input after cursor movement across every construct.
- **Atomic ranges** — assert `ArrowLeft`/`ArrowRight` skip concealed markers.
- **E2E (Playwright)** — click-to-reveal round trip and checkbox toggling.

Implementation follows TDD: failing test first, then the handler.

## Risks

- Tauri's asset protocol may need a Rust capability change for vault-relative
  images. If that is blocked, images degrade to styled alt-text and the
  limitation is reported rather than silently dropped.
- Line-height shifts when revealing markers on wrapped lines are inherent to
  this style of editor.
- `@codemirror/language-data` is a new dependency. Grammars are dynamically
  imported, so the initial bundle grows only by the language index.

## Acceptance criteria

Inherited from the story, plus this design's additions:

- [ ] Headings render at appropriate visual sizes when the cursor is elsewhere.
- [ ] Bold, italic, strikethrough render visually when unfocused.
- [ ] Wiki links `[[Target]]` render as styled link text.
- [ ] Task checkboxes render as interactive checkboxes.
- [ ] Cursor entering a construct reveals its markdown source.
- [ ] Multi-line selections show source for all overlapped constructs.
- [ ] No data loss — the underlying document is always raw markdown.
- [ ] Frontmatter renders as a styled block and is never mis-parsed as a
      heading.
- [ ] `editor.livePreview` toggles the mode without losing cursor or history.
- [ ] Arrow keys traverse concealed markers without sticking.

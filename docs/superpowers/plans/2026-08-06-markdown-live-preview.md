# Markdown Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Markdown formatted inline in the CodeMirror 6 editor, revealing raw syntax only for the construct the cursor is inside.

**Architecture:** A `ViewPlugin` walks the Lezer syntax tree over the visible range and emits two decoration sets — *presentation* (always-on line/mark classes) and *concealment* (`Decoration.replace` over syntax characters, applied only when the selection does not touch the node). Concealed ranges are also registered as `EditorView.atomicRanges` so cursor motion steps over invisible characters. The document is never modified. The whole extension is contributed through the existing ordered hook registry and held in a `Compartment` so a settings toggle can reconfigure it in place.

**Tech Stack:** TypeScript, CodeMirror 6 (`@codemirror/view`, `@codemirror/state`, `@codemirror/language`, `@codemirror/lang-markdown`), Lezer (`@lezer/common`, `@lezer/markdown`), `@codemirror/language-data`, React 19, Vitest + happy-dom, Playwright, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-06-markdown-live-preview-design.md`

## Global Constraints

- **Never commit automatically.** `AGENTS.md` forbids it. This overrides the writing-plans skill's default commit steps: every task ends with a QA step and a *recommended* commit message handed to the user. Do not run `git commit`.
- Files stay under 500 lines; prefer small focused modules (`AGENTS.md`).
- No `any` types. Use `unknown` or precise types (`AGENTS.md`).
- `packages/core` stays platform-agnostic. UI never imports Tauri directly — native access goes through `apps/desktop/src/native/` adapters (`AGENTS.md`).
- All colors come from `--tn-*` tokens. No hardcoded hex values.
- Run `pnpm lint` and `pnpm typecheck` before declaring a task done.
- DOM tests need `// @vitest-environment happy-dom` as the first line (repo convention).
- All new code lives under `apps/desktop/src/tabs/livePreview/` unless a step says otherwise.

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `livePreview/options.ts` | `LivePreviewOptions` type. |
| `livePreview/reveal.ts` | Pure selection-overlap predicates. |
| `livePreview/frontmatterRange.ts` | Pure frontmatter block detection. |
| `livePreview/decorate.ts` | Tree walk + decoration builders; dispatches to node handlers. |
| `livePreview/handlers.ts` | The node-name → handler dispatch table. |
| `livePreview/nodes/headings.ts` | ATX headings. |
| `livePreview/nodes/emphasis.ts` | Bold, italic, strikethrough. |
| `livePreview/nodes/code.ts` | Inline code, fenced code. |
| `livePreview/nodes/blocks.ts` | Blockquotes, horizontal rules. |
| `livePreview/nodes/lists.ts` | List marks, task checkboxes. |
| `livePreview/nodes/links.ts` | Links, images, wiki links. |
| `livePreview/widgets.ts` | `TaskCheckboxWidget`, `ImageWidget`. |
| `livePreview/wikiLink.ts` | Lezer inline parser for `[[Target]]`. |
| `livePreview/theme.ts` | `EditorView.theme` from `--tn-*` tokens. |
| `livePreview/index.ts` | `livePreview(options)` public entry point. |
| `livePreview/harness.ts` | Test-only mount helper (not a `.test.ts`, so vitest won't collect it). |
| `apps/desktop/src/native/assets.ts` | Tauri asset-protocol URL adapter. |
| `apps/desktop/demo/live-preview.html` | Demo page shell. |
| `apps/desktop/demo/main.tsx` | Demo entry importing the real modules. |

**Modified:** `tabs/markdownEditorHooks.ts`, `tabs/MarkdownEditor.tsx`, `shell/TabContent.tsx`, `shell/DesktopShell.tsx`, `commands/commandRegistry.ts`, `packages/core/src/settings/modules/editor.ts`, `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/tsconfig.json`.

---

### Task 1: Reveal predicates

The single decision that defines the whole feature: *is this construct currently revealed?* Pure functions over `EditorState`, no view access, so they are trivially testable.

**Files:**
- Create: `apps/desktop/src/tabs/livePreview/reveal.ts`
- Test: `apps/desktop/src/tabs/livePreview/reveal.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `selectionTouchesRange(state: EditorState, from: number, to: number): boolean`, `selectionTouchesLine(state: EditorState, pos: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/tabs/livePreview/reveal.test.ts
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { selectionTouchesLine, selectionTouchesRange } from "./reveal";

const stateAt = (doc: string, anchor: number, head = anchor): EditorState =>
  EditorState.create({ doc, selection: { anchor, head } });

describe("selectionTouchesRange", () => {
  it("is false when the cursor sits outside the range", () => {
    // doc: "a **b** c" — the StrongEmphasis node spans 2..7.
    expect(selectionTouchesRange(stateAt("a **b** c", 0), 2, 7)).toBe(false);
  });

  it("is true when the cursor sits inside the range", () => {
    expect(selectionTouchesRange(stateAt("a **b** c", 4), 2, 7)).toBe(true);
  });

  it("is true when the cursor sits exactly on either boundary", () => {
    expect(selectionTouchesRange(stateAt("a **b** c", 2), 2, 7)).toBe(true);
    expect(selectionTouchesRange(stateAt("a **b** c", 7), 2, 7)).toBe(true);
  });

  it("is true when a selection merely overlaps the range", () => {
    expect(selectionTouchesRange(stateAt("a **b** c", 0, 3), 2, 7)).toBe(true);
  });

  it("is true when any range of a multi-range selection overlaps", () => {
    const state = EditorState.create({
      doc: "a **b** c",
      selection: { ranges: [{ anchor: 0 }, { anchor: 4 }], main: 0 },
      extensions: [EditorState.allowMultipleSelections.of(true)]
    });
    expect(selectionTouchesRange(state, 2, 7)).toBe(true);
  });
});

describe("selectionTouchesLine", () => {
  it("is false when the cursor is on a different line", () => {
    expect(selectionTouchesLine(stateAt("## one\n\ntwo", 8), 0)).toBe(false);
  });

  it("is true anywhere on the same line", () => {
    expect(selectionTouchesLine(stateAt("## one\n\ntwo", 5), 0)).toBe(true);
  });

  it("is true when a multi-line selection covers the line", () => {
    expect(selectionTouchesLine(stateAt("## one\n\ntwo", 0, 10), 3)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- reveal`
Expected: FAIL — `Failed to resolve import "./reveal"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/desktop/src/tabs/livePreview/reveal.ts
import type { EditorState } from "@codemirror/state";

/**
 * Selection-overlap predicates that decide whether a construct shows its raw
 * Markdown source.
 *
 * Boundary positions count as touching: a cursor resting immediately after
 * `**bold**` still reveals it, which is what a user editing the end of a word
 * expects. Both predicates consider every range of a multi-range selection.
 */

/** True when any selection range overlaps the inclusive span `[from, to]`. */
export function selectionTouchesRange(
  state: EditorState,
  from: number,
  to: number
): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

/** True when any selection range overlaps the line containing `pos`. */
export function selectionTouchesLine(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos);
  return selectionTouchesRange(state, line.from, line.to);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @thinkbrain/desktop test -- reveal`
Expected: PASS — 8 tests.

- [ ] **Step 5: QA and hand off**

Run: `pnpm lint && pnpm typecheck`
Recommended commit message: `feat(editor): add live-preview reveal predicates`

---

### Task 2: Frontmatter range detection

The stock Markdown parser reads a leading `---` as a horizontal rule and the closing `---` as a setext underline, so `title: My Note` currently renders as a giant H2. Rather than adding a parser extension, detect the block with a pure function and have the decorator skip every node inside it. Fewer dependencies, no language nesting, and trivially testable.

**Files:**
- Create: `apps/desktop/src/tabs/livePreview/frontmatterRange.ts`
- Test: `apps/desktop/src/tabs/livePreview/frontmatterRange.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `findFrontmatterRange(doc: Text): FrontmatterRange | null` where `interface FrontmatterRange { readonly from: number; readonly to: number; readonly firstLine: number; readonly lastLine: number }`. `from`/`to` are document offsets covering both fence lines inclusive; `firstLine`/`lastLine` are 1-based line numbers.

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/tabs/livePreview/frontmatterRange.test.ts
import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { findFrontmatterRange } from "./frontmatterRange";

const doc = (source: string): Text => Text.of(source.split("\n"));

describe("findFrontmatterRange", () => {
  it("finds a well-formed block at the start of the document", () => {
    const source = "---\ntitle: My Note\ntags: [a]\n---\n\n# Heading";
    expect(findFrontmatterRange(doc(source))).toEqual({
      from: 0,
      to: 32,
      firstLine: 1,
      lastLine: 4
    });
  });

  it("returns null when the document does not open with a fence", () => {
    expect(findFrontmatterRange(doc("# Heading\n\n---\na: b\n---"))).toBeNull();
  });

  it("returns null for an unterminated block", () => {
    expect(findFrontmatterRange(doc("---\ntitle: My Note\n"))).toBeNull();
  });

  it("returns null when the fence is immediately closed by a setext-style rule", () => {
    // "---\n---" is an empty block; there is nothing to display, and treating
    // it as frontmatter would swallow a legitimate horizontal rule pair.
    expect(findFrontmatterRange(doc("---\n---\n"))).toBeNull();
  });

  it("tolerates trailing whitespace on the fences", () => {
    const result = findFrontmatterRange(doc("---  \na: b\n---\t\n"));
    expect(result?.lastLine).toBe(3);
  });

  it("returns null for an empty document", () => {
    expect(findFrontmatterRange(doc(""))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- frontmatterRange`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/desktop/src/tabs/livePreview/frontmatterRange.ts
import type { Text } from "@codemirror/state";

/**
 * Locates a YAML frontmatter block so live preview can style it as structured
 * data and suppress Markdown decoration inside it.
 *
 * This is deliberately a plain scan rather than a Lezer parser extension. The
 * only thing the decorator needs is the block's extent, and a pure function
 * over the document is far cheaper to reason about and test than nesting a
 * second language inside the Markdown parser.
 */

/** A frontmatter block, covering both fence lines inclusive. */
export interface FrontmatterRange {
  readonly from: number;
  readonly to: number;
  /** 1-based line number of the opening `---`. */
  readonly firstLine: number;
  /** 1-based line number of the closing `---`. */
  readonly lastLine: number;
}

/** Matches a fence line: exactly three dashes plus optional trailing space. */
const FENCE = /^---[ \t]*$/;

/**
 * Returns the frontmatter block at the very start of `doc`, or `null`.
 *
 * A block must open on line 1, close on a later line, and contain at least one
 * body line — `---\n---` is treated as two horizontal rules, not an empty
 * block.
 */
export function findFrontmatterRange(doc: Text): FrontmatterRange | null {
  if (doc.lines < 3) return null;
  if (!FENCE.test(doc.line(1).text)) return null;

  for (let lineNumber = 2; lineNumber <= doc.lines; lineNumber++) {
    const line = doc.line(lineNumber);
    if (!FENCE.test(line.text)) continue;
    // `lineNumber === 2` means an empty block; leave it to the Markdown parser.
    if (lineNumber === 2) return null;
    return { from: 0, to: line.to, firstLine: 1, lastLine: lineNumber };
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @thinkbrain/desktop test -- frontmatterRange`
Expected: PASS — 6 tests.

- [ ] **Step 5: QA and hand off**

Run: `pnpm lint && pnpm typecheck`
Recommended commit message: `feat(editor): detect YAML frontmatter range for live preview`

---

### Task 3: Decoration engine and headings

The first vertical slice: after this task `## hello` genuinely renders as an H2 reading `hello`, and reveals `## hello` when the cursor lands on it. Everything after this task is one more node handler plugged into the same engine.

**Files:**
- Create: `apps/desktop/src/tabs/livePreview/options.ts`
- Create: `apps/desktop/src/tabs/livePreview/decorate.ts`
- Create: `apps/desktop/src/tabs/livePreview/handlers.ts`
- Create: `apps/desktop/src/tabs/livePreview/nodes/headings.ts`
- Create: `apps/desktop/src/tabs/livePreview/theme.ts`
- Create: `apps/desktop/src/tabs/livePreview/index.ts`
- Create: `apps/desktop/src/tabs/livePreview/harness.ts`
- Test: `apps/desktop/src/tabs/livePreview/nodes/headings.test.ts`
- Modify: `apps/desktop/package.json` (add `@lezer/common`)

**Interfaces:**
- Consumes: `selectionTouchesRange`, `selectionTouchesLine` (Task 1); `findFrontmatterRange`, `FrontmatterRange` (Task 2).
- Produces:
  - `interface LivePreviewOptions { readonly resolveAssetUrl?: (src: string) => string | null }`
  - `interface DecorateContext { readonly state: EditorState; readonly options: LivePreviewOptions; readonly present: (deco: Decoration, from: number, to: number) => void; readonly conceal: (from: number, to: number, revealed: boolean) => void }`
  - `type NodeHandler = (node: SyntaxNodeRef, ctx: DecorateContext) => void`
  - `buildDecorations(view: EditorView, options: LivePreviewOptions): { content: DecorationSet; atomic: DecorationSet }`
  - `livePreview(options?: LivePreviewOptions): Extension`
  - `const handlers: Record<string, NodeHandler>` in `handlers.ts`
  - `const headingHandlers: Record<string, NodeHandler>` in `nodes/headings.ts`
  - Harness: `mountPreview(source: string, cursor?: number): PreviewHandle` where `interface PreviewHandle { readonly view: EditorView; lineText(lineNumber: number): string; lineClass(lineNumber: number): string; setCursor(pos: number): void; destroy(): void }`

- [ ] **Step 1: Add the Lezer types dependency**

`SyntaxNodeRef` comes from `@lezer/common`, currently only a transitive dependency. Add it explicitly so the import is legitimate.

```bash
pnpm --filter @thinkbrain/desktop add @lezer/common@^1.5.2
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/desktop/src/tabs/livePreview/nodes/headings.test.ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

describe("heading live preview", () => {
  it("hides the hash marks when the cursor is elsewhere", () => {
    preview = mountPreview("## hello\n\nbody", 11);
    expect(preview.lineText(1)).toBe("hello");
  });

  it("styles the line as a heading whether or not it is revealed", () => {
    preview = mountPreview("## hello\n\nbody", 11);
    expect(preview.lineClass(1)).toContain("cm-h2");
  });

  it("reveals the hash marks when the cursor is on the line", () => {
    preview = mountPreview("## hello\n\nbody", 4);
    expect(preview.lineText(1)).toBe("## hello");
    expect(preview.lineClass(1)).toContain("cm-h2");
  });

  it("applies the right level class for each heading depth", () => {
    preview = mountPreview("# a\n## b\n### c\n#### d\n##### e\n###### f\n\nx", 40);
    for (let level = 1; level <= 6; level++) {
      expect(preview.lineClass(level)).toContain(`cm-h${level}`);
    }
  });

  it("never alters the document", () => {
    preview = mountPreview("## hello\n\nbody", 11);
    expect(preview.view.state.doc.toString()).toBe("## hello\n\nbody");
  });

  it("leaves frontmatter untouched instead of parsing it as a heading", () => {
    // Without frontmatter suppression the parser reads `title: x` + `---` as a
    // setext H2, which is the bug this guards.
    preview = mountPreview("---\ntitle: x\n---\n\n# real", 22);
    expect(preview.lineText(2)).toBe("title: x");
    expect(preview.lineClass(2)).not.toContain("cm-h2");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- headings`
Expected: FAIL — cannot resolve `../harness`.

- [ ] **Step 4: Write the options type**

```ts
// apps/desktop/src/tabs/livePreview/options.ts

/** Host-supplied capabilities for the live-preview extension. */
export interface LivePreviewOptions {
  /**
   * Resolves a Markdown image source to a URL the webview can load.
   *
   * Returning `null` means "not resolvable" and the image degrades to styled
   * alt text. Absolute `http(s)` sources bypass this callback entirely. Keeping
   * this injectable is what lets the extension stay free of Tauri imports.
   */
  readonly resolveAssetUrl?: (src: string) => string | null;
}
```

- [ ] **Step 5: Write the decoration engine**

```ts
// apps/desktop/src/tabs/livePreview/decorate.ts
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, type DecorationSet, type EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import { findFrontmatterRange } from "./frontmatterRange";
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
    }
  };

  const frontmatter = findFrontmatterRange(state.doc);
  if (frontmatter) decorateFrontmatter(frontmatter.lastLine, ctx);

  // Decorate a single span covering every visible range rather than iterating
  // each range separately: a node straddling two ranges would otherwise be
  // decorated twice and produce duplicate replace decorations.
  const visible = view.visibleRanges;
  if (visible.length > 0) {
    const from = visible[0].from;
    const to = visible[visible.length - 1].to;
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
  }

  return {
    content: Decoration.set(content, true),
    atomic: Decoration.set(atomic, true)
  };
}

/** Styles every frontmatter line as a dimmed monospace data block. */
function decorateFrontmatter(lastLine: number, ctx: DecorateContext): void {
  for (let lineNumber = 1; lineNumber <= lastLine; lineNumber++) {
    const line = ctx.state.doc.line(lineNumber);
    const edge =
      lineNumber === 1 ? " cm-frontmatter-first" : lineNumber === lastLine ? " cm-frontmatter-last" : "";
    ctx.present(Decoration.line({ class: `cm-frontmatter${edge}` }), line.from, line.from);
  }
}
```

- [ ] **Step 6: Write the handler dispatch table**

```ts
// apps/desktop/src/tabs/livePreview/handlers.ts
import type { NodeHandler } from "./decorate";
import { headingHandlers } from "./nodes/headings";

/**
 * Maps Lezer Markdown node names to their decorator.
 *
 * Later tasks extend this table by spreading in another `nodes/*` record; the
 * engine itself never changes.
 */
export const handlers: Record<string, NodeHandler> = {
  ...headingHandlers
};
```

- [ ] **Step 7: Write the heading handler**

```ts
// apps/desktop/src/tabs/livePreview/nodes/headings.ts
import { Decoration } from "@codemirror/view";

import type { NodeHandler } from "../decorate";
import { selectionTouchesLine } from "../reveal";

/**
 * ATX headings (`## Title`).
 *
 * The line always carries its level class, so revealing the source does not
 * make the text jump between type sizes — it only makes the `##` reappear.
 */

/** Consumes the single space Markdown allows between `##` and the text. */
const skipMarkerSpace = (text: string, offset: number, markEnd: number): number =>
  text.charAt(markEnd - offset) === " " ? markEnd + 1 : markEnd;

const heading = (level: number): NodeHandler => (node, ctx) => {
  const line = ctx.state.doc.lineAt(node.from);
  ctx.present(
    Decoration.line({ class: `cm-heading cm-h${level}` }),
    line.from,
    line.from
  );

  const mark = node.node.getChild("HeaderMark");
  if (!mark) return;

  const concealTo = skipMarkerSpace(line.text, line.from, mark.to);
  ctx.conceal(mark.from, concealTo, selectionTouchesLine(ctx.state, node.from));
};

export const headingHandlers: Record<string, NodeHandler> = {
  ATXHeading1: heading(1),
  ATXHeading2: heading(2),
  ATXHeading3: heading(3),
  ATXHeading4: heading(4),
  ATXHeading5: heading(5),
  ATXHeading6: heading(6)
};
```

- [ ] **Step 8: Write the theme**

```ts
// apps/desktop/src/tabs/livePreview/theme.ts
import { EditorView } from "@codemirror/view";

/**
 * Live-preview typography and chrome.
 *
 * Prose switches to the proportional UI font while code keeps monospace; the
 * editor's base `font-mono` class still applies when live preview is off, so
 * toggling the compartment swaps fonts with no extra wiring. Every color is a
 * `--tn-*` token so imported themes restyle the editor for free.
 */
export const livePreviewTheme = EditorView.theme({
  ".cm-content": {
    fontFamily: "var(--tn-font-sans)"
  },

  ".cm-heading": {
    fontWeight: "700",
    lineHeight: "1.3"
  },
  ".cm-h1": { fontSize: "1.9em" },
  ".cm-h2": { fontSize: "1.55em" },
  ".cm-h3": { fontSize: "1.3em" },
  ".cm-h4": { fontSize: "1.15em" },
  ".cm-h5": { fontSize: "1.05em" },
  ".cm-h6": {
    fontSize: "0.95em",
    color: "var(--tn-color-muted-foreground)",
    textTransform: "uppercase",
    letterSpacing: "0.04em"
  },

  ".cm-syntax-mark": {
    color: "var(--tn-color-muted-foreground)",
    opacity: "0.7"
  },

  ".cm-frontmatter": {
    fontFamily: "var(--tn-font-mono, ui-monospace, monospace)",
    fontSize: "0.85em",
    color: "var(--tn-color-muted-foreground)",
    backgroundColor:
      "color-mix(in srgb, var(--tn-color-muted-foreground) 8%, transparent)",
    borderLeft: "2px solid var(--tn-color-border)",
    paddingLeft: "0.6em"
  },
  ".cm-frontmatter-first": { paddingTop: "0.25em" },
  ".cm-frontmatter-last": { paddingBottom: "0.25em" }
});
```

- [ ] **Step 9: Write the public entry point**

```ts
// apps/desktop/src/tabs/livePreview/index.ts
import type { Extension } from "@codemirror/state";
import { Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { EditorView } from "@codemirror/view";

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
        if (!update.docChanged && !update.selectionSet && !update.viewportChanged) return;
        const built = buildDecorations(update.view, options);
        this.decorations = built.content;
        this.atomic = built.atomic;
      }
    },
    {
      decorations: (value) => value.decorations,
      provide: (plugin) =>
        EditorView.atomicRanges.of(
          (view) => view.plugin(plugin)?.atomic ?? Decoration.none
        )
    }
  );

  return [plugin, livePreviewTheme];
}
```

- [ ] **Step 10: Write the test harness**

```ts
// apps/desktop/src/tabs/livePreview/harness.ts
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { livePreview } from "./index";
import type { LivePreviewOptions } from "./options";

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
        markdown({ base: markdownLanguage }),
        EditorView.lineWrapping,
        livePreview(options)
      ]
    })
  });

  const lineElement = (lineNumber: number): HTMLElement => {
    const line = view.state.doc.line(lineNumber);
    const element = view.domAtPos(line.from).node;
    const host = element instanceof HTMLElement ? element : element.parentElement;
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
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `pnpm --filter @thinkbrain/desktop test -- headings`
Expected: PASS — 6 tests.

If `lineText` returns the concealed characters anyway, confirm the view has a
non-zero viewport in happy-dom; when the editor reports an empty
`visibleRanges`, force a measure with `view.requestMeasure()` or fall back to
decorating `0 .. state.doc.length` when `visibleRanges` is empty. Prefer the
fallback — it also protects the real app during initial mount.

- [ ] **Step 12: QA and hand off**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @thinkbrain/desktop test`
Recommended commit message: `feat(editor): add live-preview decoration engine and headings`

---

### Task 4: Emphasis and GFM parsing

Bold, italic and strikethrough. Strikethrough and task lists only exist in the GFM dialect, so this task also switches the Markdown language's base — the editor currently parses strict CommonMark, which silently has no `~~strike~~`, no tables, and no task lists.

**Files:**
- Create: `apps/desktop/src/tabs/livePreview/nodes/emphasis.ts`
- Modify: `apps/desktop/src/tabs/livePreview/handlers.ts`
- Modify: `apps/desktop/src/tabs/livePreview/theme.ts`
- Modify: `apps/desktop/src/tabs/markdownEditorHooks.ts:42-45`
- Test: `apps/desktop/src/tabs/livePreview/nodes/emphasis.test.ts`

**Interfaces:**
- Consumes: `NodeHandler`, `DecorateContext` (Task 3); `selectionTouchesRange` (Task 1); `mountPreview`, `PreviewHandle` (Task 3).
- Produces: `const emphasisHandlers: Record<string, NodeHandler>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/tabs/livePreview/nodes/emphasis.test.ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

describe("emphasis live preview", () => {
  it("hides bold markers when the cursor is outside the node", () => {
    preview = mountPreview("a **b** c", 0);
    expect(preview.lineText(1)).toBe("a b c");
  });

  it("reveals bold markers only when the cursor is inside that node", () => {
    preview = mountPreview("a **b** c", 5);
    expect(preview.lineText(1)).toBe("a **b** c");
  });

  it("keeps other nodes on the same line concealed (per-node reveal)", () => {
    // Cursor inside the first bold run; the italic run must stay rendered.
    preview = mountPreview("**x** and *y*", 3);
    expect(preview.lineText(1)).toBe("**x** and y");
  });

  it("hides italic and strikethrough markers", () => {
    preview = mountPreview("*i* and ~~s~~", 0);
    expect(preview.lineText(1)).toBe("i and s");
  });

  it("never alters the document", () => {
    preview = mountPreview("a **b** c", 5);
    expect(preview.view.state.doc.toString()).toBe("a **b** c");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- emphasis`
Expected: FAIL — markers are not concealed; first assertion returns `"a **b** c"`.

- [ ] **Step 3: Write the emphasis handler**

```ts
// apps/desktop/src/tabs/livePreview/nodes/emphasis.ts
import { Decoration } from "@codemirror/view";

import type { NodeHandler } from "../decorate";
import { selectionTouchesRange } from "../reveal";

/**
 * Bold, italic and strikethrough.
 *
 * Reveal is per-node: the cursor must be inside (or on the boundary of) the
 * emphasised run itself, so moving through one bold word does not flash the
 * markers of every other span on the line.
 */
const emphasis = (className: string, markName: string): NodeHandler => (node, ctx) => {
  ctx.present(Decoration.mark({ class: className }), node.from, node.to);

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  for (const mark of node.node.getChildren(markName)) {
    ctx.conceal(mark.from, mark.to, revealed);
  }
};

export const emphasisHandlers: Record<string, NodeHandler> = {
  StrongEmphasis: emphasis("cm-strong", "EmphasisMark"),
  Emphasis: emphasis("cm-em", "EmphasisMark"),
  Strikethrough: emphasis("cm-strike", "StrikethroughMark")
};
```

- [ ] **Step 4: Register the handlers**

```ts
// apps/desktop/src/tabs/livePreview/handlers.ts
import type { NodeHandler } from "./decorate";
import { emphasisHandlers } from "./nodes/emphasis";
import { headingHandlers } from "./nodes/headings";

export const handlers: Record<string, NodeHandler> = {
  ...headingHandlers,
  ...emphasisHandlers
};
```

- [ ] **Step 5: Add the emphasis styles**

Add these entries to the object passed to `EditorView.theme` in `theme.ts`, after the `.cm-h6` block:

```ts
  ".cm-strong": { fontWeight: "700" },
  ".cm-em": { fontStyle: "italic" },
  ".cm-strike": {
    textDecoration: "line-through",
    color: "var(--tn-color-muted-foreground)"
  },
```

- [ ] **Step 6: Switch the parser to GFM**

Replace the `markdown-language` hook body in `apps/desktop/src/tabs/markdownEditorHooks.ts:42-45`:

```ts
    {
      id: "markdown-language",
      order: 20,
      // GFM rather than strict CommonMark: strikethrough, task lists and tables
      // only exist in the GFM dialect, and live preview decorates all three.
      extensions: () => [markdown({ base: markdownLanguage })]
    },
```

and update the import on line 2:

```ts
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @thinkbrain/desktop test -- emphasis`
Expected: PASS — 5 tests.

- [ ] **Step 8: QA and hand off**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @thinkbrain/desktop test`
Recommended commit message: `feat(editor): live-preview emphasis and switch parser to GFM`

---

### Task 5: Inline code and fenced code blocks

**Files:**
- Create: `apps/desktop/src/tabs/livePreview/nodes/code.ts`
- Modify: `apps/desktop/src/tabs/livePreview/handlers.ts`
- Modify: `apps/desktop/src/tabs/livePreview/theme.ts`
- Modify: `apps/desktop/src/tabs/markdownEditorHooks.ts` (`markdown-language` hook)
- Modify: `apps/desktop/package.json` (add `@codemirror/language-data`)
- Test: `apps/desktop/src/tabs/livePreview/nodes/code.test.ts`

**Interfaces:**
- Consumes: `NodeHandler` (Task 3); `selectionTouchesRange`, `selectionTouchesLine` (Task 1).
- Produces: `const codeHandlers: Record<string, NodeHandler>`.

- [ ] **Step 1: Add the language data dependency**

```bash
pnpm --filter @thinkbrain/desktop add @codemirror/language-data@^6.5.1
```

Grammars are dynamically imported by `LanguageDescription.load()`, so the
initial bundle grows only by the language index.

- [ ] **Step 2: Write the failing test**

```ts
// apps/desktop/src/tabs/livePreview/nodes/code.test.ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

describe("inline code live preview", () => {
  it("hides backticks when the cursor is elsewhere", () => {
    preview = mountPreview("run `npm test` now", 0);
    expect(preview.lineText(1)).toBe("run npm test now");
  });

  it("reveals backticks when the cursor is inside the span", () => {
    preview = mountPreview("run `npm test` now", 8);
    expect(preview.lineText(1)).toBe("run `npm test` now");
  });

  it("styles the span as code", () => {
    preview = mountPreview("run `npm test` now", 0);
    expect(preview.view.dom.querySelector(".cm-inline-code")).not.toBeNull();
  });
});

describe("fenced code live preview", () => {
  const source = "text\n\n```js\nlet a = 1;\n```\n\nmore";

  it("hides both fences when the cursor is outside the block", () => {
    preview = mountPreview(source, 0);
    expect(preview.lineText(3)).toBe("");
    expect(preview.lineText(5)).toBe("");
  });

  it("reveals a fence when the cursor is on that fence line", () => {
    preview = mountPreview(source, 8);
    expect(preview.lineText(3)).toBe("```js");
  });

  it("marks every line of the block, with rounded first and last", () => {
    preview = mountPreview(source, 0);
    expect(preview.lineClass(3)).toContain("cm-code-line-first");
    expect(preview.lineClass(4)).toContain("cm-code-line");
    expect(preview.lineClass(5)).toContain("cm-code-line-last");
  });

  it("never alters the document", () => {
    preview = mountPreview(source, 0);
    expect(preview.view.state.doc.toString()).toBe(source);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- code`
Expected: FAIL — backticks still rendered.

- [ ] **Step 4: Write the code handler**

```ts
// apps/desktop/src/tabs/livePreview/nodes/code.ts
import { Decoration } from "@codemirror/view";

import type { NodeHandler } from "../decorate";
import { selectionTouchesLine, selectionTouchesRange } from "../reveal";

/**
 * Inline code spans and fenced code blocks.
 *
 * Inline spans reveal per node; fences reveal per line, because a fence is a
 * line-leading marker with no meaningful inside for a cursor to occupy.
 */

const inlineCode: NodeHandler = (node, ctx) => {
  ctx.present(Decoration.mark({ class: "cm-inline-code" }), node.from, node.to);

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  for (const mark of node.node.getChildren("CodeMark")) {
    ctx.conceal(mark.from, mark.to, revealed);
  }
};

const fencedCode: NodeHandler = (node, ctx) => {
  const { doc } = ctx.state;
  const firstLine = doc.lineAt(node.from).number;
  const lastLine = doc.lineAt(node.to).number;

  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
    const line = doc.line(lineNumber);
    const edge =
      lineNumber === firstLine
        ? " cm-code-line-first"
        : lineNumber === lastLine
          ? " cm-code-line-last"
          : "";
    ctx.present(Decoration.line({ class: `cm-code-line${edge}` }), line.from, line.from);
  }

  // Conceal each fence across its whole line so the info string (```js) goes
  // with it; `getChildren` yields the opening fence first.
  for (const mark of node.node.getChildren("CodeMark")) {
    const line = doc.lineAt(mark.from);
    ctx.conceal(line.from, line.to, selectionTouchesLine(ctx.state, mark.from));
  }
};

export const codeHandlers: Record<string, NodeHandler> = {
  InlineCode: inlineCode,
  FencedCode: fencedCode
};
```

- [ ] **Step 5: Register the handlers**

Add `import { codeHandlers } from "./nodes/code";` to `handlers.ts` and spread
`...codeHandlers` into the exported record after `...emphasisHandlers`.

- [ ] **Step 6: Add the code styles**

Add to the `EditorView.theme` object in `theme.ts`:

```ts
  ".cm-inline-code": {
    fontFamily: "var(--tn-font-mono, ui-monospace, monospace)",
    fontSize: "0.88em",
    backgroundColor:
      "color-mix(in srgb, var(--tn-color-muted-foreground) 12%, transparent)",
    padding: "0.08em 0.35em",
    borderRadius: "4px"
  },
  ".cm-code-line": {
    fontFamily: "var(--tn-font-mono, ui-monospace, monospace)",
    fontSize: "0.88em",
    backgroundColor:
      "color-mix(in srgb, var(--tn-color-muted-foreground) 10%, transparent)"
  },
  ".cm-code-line-first": { borderRadius: "6px 6px 0 0", paddingTop: "0.25em" },
  ".cm-code-line-last": { borderRadius: "0 0 6px 6px", paddingBottom: "0.25em" },
```

- [ ] **Step 7: Enable lazy code highlighting**

Update the `markdown-language` hook in `markdownEditorHooks.ts` to pass
`codeLanguages`, and add the import:

```ts
import { languages } from "@codemirror/language-data";
```

```ts
    {
      id: "markdown-language",
      order: 20,
      // GFM rather than strict CommonMark: strikethrough, task lists and tables
      // only exist in the GFM dialect, and live preview decorates all three.
      // `languages` lazily imports a grammar the first time a fenced block
      // names it, so the initial bundle only carries the language index.
      extensions: () => [markdown({ base: markdownLanguage, codeLanguages: languages })]
    },
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @thinkbrain/desktop test -- code`
Expected: PASS — 7 tests.

- [ ] **Step 9: QA and hand off**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @thinkbrain/desktop test`
Recommended commit message: `feat(editor): live-preview code spans and fenced blocks`

---

### Task 6: Blockquotes and horizontal rules

**Files:**
- Create: `apps/desktop/src/tabs/livePreview/nodes/blocks.ts`
- Modify: `apps/desktop/src/tabs/livePreview/handlers.ts`
- Modify: `apps/desktop/src/tabs/livePreview/theme.ts`
- Test: `apps/desktop/src/tabs/livePreview/nodes/blocks.test.ts`

**Interfaces:**
- Consumes: `NodeHandler` (Task 3); `selectionTouchesLine` (Task 1).
- Produces: `const blockHandlers: Record<string, NodeHandler>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/tabs/livePreview/nodes/blocks.test.ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

describe("blockquote live preview", () => {
  it("hides the quote marker when the cursor is elsewhere", () => {
    preview = mountPreview("> quoted\n\nafter", 11);
    expect(preview.lineText(1)).toBe("quoted");
  });

  it("reveals the quote marker when the cursor is on the line", () => {
    preview = mountPreview("> quoted\n\nafter", 4);
    expect(preview.lineText(1)).toBe("> quoted");
  });

  it("styles every line of the quote", () => {
    preview = mountPreview("> one\n> two\n\nafter", 14);
    expect(preview.lineClass(1)).toContain("cm-quote-line");
    expect(preview.lineClass(2)).toContain("cm-quote-line");
  });
});

describe("horizontal rule live preview", () => {
  it("hides the dashes and styles the line as a rule", () => {
    preview = mountPreview("a\n\n---\n\nb", 0);
    expect(preview.lineText(3)).toBe("");
    expect(preview.lineClass(3)).toContain("cm-hr-line");
  });

  it("reveals the dashes when the cursor is on the line", () => {
    preview = mountPreview("a\n\n---\n\nb", 4);
    expect(preview.lineText(3)).toBe("---");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- blocks`
Expected: FAIL — markers still rendered.

- [ ] **Step 3: Write the block handler**

```ts
// apps/desktop/src/tabs/livePreview/nodes/blocks.ts
import { Decoration } from "@codemirror/view";

import type { NodeHandler } from "../decorate";
import { selectionTouchesLine } from "../reveal";

/**
 * Blockquotes and horizontal rules — both line-leading constructs, so both
 * reveal per line.
 */

const blockquote: NodeHandler = (node, ctx) => {
  const { doc } = ctx.state;
  const firstLine = doc.lineAt(node.from).number;
  const lastLine = doc.lineAt(node.to).number;
  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
    const line = doc.line(lineNumber);
    ctx.present(Decoration.line({ class: "cm-quote-line" }), line.from, line.from);
  }
};

/** `QuoteMark` is a separate node, visited on its own. */
const quoteMark: NodeHandler = (node, ctx) => {
  const { doc } = ctx.state;
  // Swallow the single space Markdown allows after `>`.
  const to = doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
  ctx.conceal(node.from, to, selectionTouchesLine(ctx.state, node.from));
};

const horizontalRule: NodeHandler = (node, ctx) => {
  const line = ctx.state.doc.lineAt(node.from);
  ctx.present(Decoration.line({ class: "cm-hr-line" }), line.from, line.from);
  ctx.conceal(node.from, node.to, selectionTouchesLine(ctx.state, node.from));
};

export const blockHandlers: Record<string, NodeHandler> = {
  Blockquote: blockquote,
  QuoteMark: quoteMark,
  HorizontalRule: horizontalRule
};
```

- [ ] **Step 4: Register the handlers**

Add `import { blockHandlers } from "./nodes/blocks";` to `handlers.ts` and
spread `...blockHandlers` into the exported record.

- [ ] **Step 5: Add the block styles**

Add to the `EditorView.theme` object in `theme.ts`:

```ts
  ".cm-quote-line": {
    borderLeft: "3px solid var(--tn-color-border)",
    paddingLeft: "0.8em",
    color: "var(--tn-color-muted-foreground)",
    fontStyle: "italic"
  },
  ".cm-hr-line": {
    position: "relative",
    height: "1.5em"
  },
  ".cm-hr-line::before": {
    content: '""',
    position: "absolute",
    left: "0",
    right: "0",
    top: "50%",
    borderTop: "1px solid var(--tn-color-border)"
  },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @thinkbrain/desktop test -- blocks`
Expected: PASS — 5 tests.

- [ ] **Step 7: QA and hand off**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @thinkbrain/desktop test`
Recommended commit message: `feat(editor): live-preview blockquotes and horizontal rules`

---

### Task 7: Lists and task checkboxes

List markers stay visible — they carry meaning — but task markers become real interactive checkboxes.

**Files:**
- Create: `apps/desktop/src/tabs/livePreview/widgets.ts`
- Create: `apps/desktop/src/tabs/livePreview/nodes/lists.ts`
- Modify: `apps/desktop/src/tabs/livePreview/handlers.ts`
- Modify: `apps/desktop/src/tabs/livePreview/decorate.ts` (add `replaceWith`)
- Modify: `apps/desktop/src/tabs/livePreview/theme.ts`
- Test: `apps/desktop/src/tabs/livePreview/nodes/lists.test.ts`

**Interfaces:**
- Consumes: `NodeHandler`, `DecorateContext` (Task 3).
- Produces:
  - `class TaskCheckboxWidget extends WidgetType` with `constructor(checked: boolean, pos: number)`
  - `const listHandlers: Record<string, NodeHandler>`
  - `DecorateContext` gains `readonly replaceWith: (from: number, to: number, widget: WidgetType) => void`

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/tabs/livePreview/nodes/lists.test.ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

const checkbox = (handle: PreviewHandle): HTMLInputElement => {
  const element = handle.view.dom.querySelector(".cm-task-checkbox");
  if (!(element instanceof HTMLInputElement)) throw new Error("no checkbox rendered");
  return element;
};

describe("list live preview", () => {
  it("keeps bullet markers visible because they carry meaning", () => {
    preview = mountPreview("- one\n- two\n", 0);
    expect(preview.lineText(1)).toBe("- one");
  });

  it("styles the bullet marker", () => {
    preview = mountPreview("- one\n- two\n", 0);
    expect(preview.view.dom.querySelector(".cm-list-mark")).not.toBeNull();
  });

  it("keeps ordered list numbers visible", () => {
    preview = mountPreview("1. one\n2. two\n", 0);
    expect(preview.lineText(1)).toBe("1. one");
  });
});

describe("task checkbox live preview", () => {
  it("renders an unchecked checkbox for an open task", () => {
    preview = mountPreview("- [ ] todo\n", 0);
    expect(checkbox(preview).checked).toBe(false);
  });

  it("renders a checked checkbox for a done task", () => {
    preview = mountPreview("- [x] done\n", 0);
    expect(checkbox(preview).checked).toBe(true);
  });

  it("writes the document when the checkbox is clicked", () => {
    preview = mountPreview("- [ ] todo\n", 0);
    checkbox(preview).click();
    expect(preview.view.state.doc.toString()).toBe("- [x] todo\n");
  });

  it("unchecks a done task when clicked", () => {
    preview = mountPreview("- [x] done\n", 0);
    checkbox(preview).click();
    expect(preview.view.state.doc.toString()).toBe("- [ ] done\n");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- lists`
Expected: FAIL — no `.cm-task-checkbox` in the DOM.

- [ ] **Step 3: Add widget support to the decoration context**

In `decorate.ts`, add `WidgetType` to the `@codemirror/view` import, add this
member to the `DecorateContext` interface:

```ts
  /** Replaces `[from, to)` with a widget, always — widgets never conceal. */
  readonly replaceWith: (from: number, to: number, widget: WidgetType) => void;
```

and add this property to the `ctx` object literal in `buildDecorations`, after
`conceal`:

```ts
    replaceWith: (from, to, widget) => {
      if (from >= to) return;
      const deco = Decoration.replace({ widget });
      content.push(deco.range(from, to));
      atomic.push(deco.range(from, to));
    }
```

- [ ] **Step 4: Write the checkbox widget**

```ts
// apps/desktop/src/tabs/livePreview/widgets.ts
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
```

- [ ] **Step 5: Write the list handler**

```ts
// apps/desktop/src/tabs/livePreview/nodes/lists.ts
import { Decoration } from "@codemirror/view";

import type { NodeHandler } from "../decorate";
import { TaskCheckboxWidget } from "../widgets";

/**
 * List markers and task checkboxes.
 *
 * Bullet and number markers are styled but never concealed: unlike `##` or
 * `>`, they are part of what the rendered document says, not scaffolding for
 * it.
 */

const listMark: NodeHandler = (node, ctx) => {
  ctx.present(Decoration.mark({ class: "cm-list-mark" }), node.from, node.to);
};

/**
 * `TaskMarker` covers the `[ ]` / `[x]` triple. It is replaced unconditionally
 * — a checkbox is easier to edit than its source, so there is nothing to
 * reveal.
 */
const taskMarker: NodeHandler = (node, ctx) => {
  const checked = /x/i.test(ctx.state.doc.sliceString(node.from, node.to));
  ctx.replaceWith(node.from, node.to, new TaskCheckboxWidget(checked, node.from));
};

const task: NodeHandler = (node, ctx) => {
  const marker = node.node.getChild("TaskMarker");
  if (!marker) return;
  if (!/x/i.test(ctx.state.doc.sliceString(marker.from, marker.to))) return;
  ctx.present(Decoration.mark({ class: "cm-task-done" }), marker.to, node.to);
};

export const listHandlers: Record<string, NodeHandler> = {
  ListMark: listMark,
  TaskMarker: taskMarker,
  Task: task
};
```

- [ ] **Step 6: Register the handlers**

Add `import { listHandlers } from "./nodes/lists";` to `handlers.ts` and spread
`...listHandlers` into the exported record.

- [ ] **Step 7: Add the list styles**

Add to the `EditorView.theme` object in `theme.ts`:

```ts
  ".cm-list-mark": {
    color: "var(--tn-color-primary)",
    fontWeight: "600"
  },
  ".cm-task-checkbox-wrap": {
    display: "inline-flex",
    alignItems: "center",
    marginRight: "0.35em"
  },
  ".cm-task-checkbox": {
    width: "15px",
    height: "15px",
    accentColor: "var(--tn-color-primary)",
    cursor: "pointer"
  },
  ".cm-task-done": {
    color: "var(--tn-color-muted-foreground)",
    textDecoration: "line-through"
  },
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @thinkbrain/desktop test -- lists`
Expected: PASS — 7 tests.

- [ ] **Step 9: QA and hand off**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @thinkbrain/desktop test`
Recommended commit message: `feat(editor): live-preview lists and interactive task checkboxes`

---

### Task 8: Links and inline images

**Files:**
- Create: `apps/desktop/src/tabs/livePreview/nodes/links.ts`
- Modify: `apps/desktop/src/tabs/livePreview/widgets.ts` (add `ImageWidget`)
- Modify: `apps/desktop/src/tabs/livePreview/handlers.ts`
- Modify: `apps/desktop/src/tabs/livePreview/theme.ts`
- Test: `apps/desktop/src/tabs/livePreview/nodes/links.test.ts`

**Interfaces:**
- Consumes: `NodeHandler` (Task 3); `selectionTouchesRange` (Task 1); `LivePreviewOptions.resolveAssetUrl` (Task 3).
- Produces:
  - `class ImageWidget extends WidgetType` with `constructor(src: string, alt: string)`
  - `const linkHandlers: Record<string, NodeHandler>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/tabs/livePreview/nodes/links.test.ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

describe("link live preview", () => {
  it("shows only the link text when the cursor is elsewhere", () => {
    preview = mountPreview("see [docs](https://example.com) now", 0);
    expect(preview.lineText(1)).toBe("see docs now");
  });

  it("reveals the full source when the cursor is inside the link", () => {
    preview = mountPreview("see [docs](https://example.com) now", 7);
    expect(preview.lineText(1)).toBe("see [docs](https://example.com) now");
  });

  it("styles the link text", () => {
    preview = mountPreview("see [docs](https://example.com) now", 0);
    expect(preview.view.dom.querySelector(".cm-link-text")).not.toBeNull();
  });
});

describe("image live preview", () => {
  it("renders an img for a remote source", () => {
    preview = mountPreview("![cat](https://example.com/c.png)", 40);
    const img = preview.view.dom.querySelector("img.cm-image");
    expect(img).toBeInstanceOf(HTMLImageElement);
    expect(img?.getAttribute("src")).toBe("https://example.com/c.png");
    expect(img?.getAttribute("alt")).toBe("cat");
  });

  it("resolves a relative source through the injected resolver", () => {
    preview = mountPreview("![cat](img/c.png)", 40, {
      resolveAssetUrl: (src) => `asset://localhost/vault/${src}`
    });
    expect(preview.view.dom.querySelector("img.cm-image")?.getAttribute("src")).toBe(
      "asset://localhost/vault/img/c.png"
    );
  });

  it("falls back to styled alt text when the source cannot be resolved", () => {
    preview = mountPreview("![cat](img/c.png)", 40);
    expect(preview.view.dom.querySelector("img.cm-image")).toBeNull();
    expect(preview.lineText(1)).toBe("cat");
    expect(preview.view.dom.querySelector(".cm-image-text")).not.toBeNull();
  });

  it("reveals the source when the cursor is inside the image", () => {
    preview = mountPreview("![cat](https://example.com/c.png)", 3);
    expect(preview.lineText(1)).toBe("![cat](https://example.com/c.png)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- links`
Expected: FAIL — link markup still rendered.

- [ ] **Step 3: Add the image widget**

Append to `apps/desktop/src/tabs/livePreview/widgets.ts`:

```ts
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
```

- [ ] **Step 4: Write the link handler**

```ts
// apps/desktop/src/tabs/livePreview/nodes/links.ts
import { Decoration } from "@codemirror/view";

import type { NodeHandler } from "../decorate";
import { selectionTouchesRange } from "../reveal";
import { ImageWidget } from "../widgets";

/**
 * Inline links and images.
 *
 * Lezer gives both the same shape: `LinkMark` `[`, the text, `LinkMark` `]`,
 * then `(`, a `URL`, and `)`. Concealing everything up to the first mark's end
 * and everything from the second mark's start leaves exactly the link text
 * visible.
 *
 * Following a link is deliberately not implemented — resolving a target to a
 * workspace file is separate work with its own rules.
 */

const REMOTE = /^(https?:|data:)/i;

/** Reads a node's `[`/`]` bracket pair, or `null` for reference-style links. */
const brackets = (node: Parameters<NodeHandler>[0]) => {
  const marks = node.node.getChildren("LinkMark");
  return marks.length >= 2 ? { open: marks[0], close: marks[1] } : null;
};

const link: NodeHandler = (node, ctx) => {
  const pair = brackets(node);
  if (!pair) return;

  ctx.present(Decoration.mark({ class: "cm-link-text" }), pair.open.to, pair.close.from);

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  ctx.conceal(node.from, pair.open.to, revealed);
  ctx.conceal(pair.close.from, node.to, revealed);
};

const image: NodeHandler = (node, ctx) => {
  const pair = brackets(node);
  if (!pair) return;

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  if (revealed) {
    ctx.conceal(node.from, pair.open.to, true);
    ctx.conceal(pair.close.from, node.to, true);
    return;
  }

  const alt = ctx.state.doc.sliceString(pair.open.to, pair.close.from);
  const urlNode = node.node.getChild("URL");
  const rawSrc = urlNode ? ctx.state.doc.sliceString(urlNode.from, urlNode.to) : "";
  const src = REMOTE.test(rawSrc) ? rawSrc : (ctx.options.resolveAssetUrl?.(rawSrc) ?? null);

  if (src) {
    ctx.replaceWith(node.from, node.to, new ImageWidget(src, alt));
    return;
  }

  // Unresolvable: show the alt text as prose rather than a broken image.
  ctx.present(Decoration.mark({ class: "cm-image-text" }), pair.open.to, pair.close.from);
  ctx.conceal(node.from, pair.open.to, false);
  ctx.conceal(pair.close.from, node.to, false);
};

export const linkHandlers: Record<string, NodeHandler> = {
  Link: link,
  Image: image
};
```

- [ ] **Step 5: Register the handlers**

Add `import { linkHandlers } from "./nodes/links";` to `handlers.ts` and spread
`...linkHandlers` into the exported record.

- [ ] **Step 6: Add the link styles**

Add to the `EditorView.theme` object in `theme.ts`:

```ts
  ".cm-link-text": {
    color: "var(--tn-color-primary)",
    textDecoration: "underline",
    textUnderlineOffset: "3px"
  },
  ".cm-image-text": {
    color: "var(--tn-color-muted-foreground)",
    fontStyle: "italic"
  },
  ".cm-image-wrap": { display: "inline-block" },
  ".cm-image": {
    maxWidth: "100%",
    borderRadius: "6px",
    verticalAlign: "bottom"
  },
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @thinkbrain/desktop test -- links`
Expected: PASS — 7 tests.

- [ ] **Step 8: QA and hand off**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @thinkbrain/desktop test`
Recommended commit message: `feat(editor): live-preview links and inline images`

---

### Task 9: Wiki links

`[[Target]]` is not standard Markdown, so this needs a Lezer inline parser before it can be decorated.

**Files:**
- Create: `apps/desktop/src/tabs/livePreview/wikiLink.ts`
- Modify: `apps/desktop/src/tabs/livePreview/nodes/links.ts`
- Modify: `apps/desktop/src/tabs/livePreview/handlers.ts`
- Modify: `apps/desktop/src/tabs/livePreview/harness.ts` (register the parser)
- Modify: `apps/desktop/src/tabs/markdownEditorHooks.ts` (register the parser)
- Modify: `apps/desktop/package.json` (add `@lezer/markdown`)
- Test: `apps/desktop/src/tabs/livePreview/wikiLink.test.ts`

**Interfaces:**
- Consumes: `NodeHandler` (Task 3); `selectionTouchesRange` (Task 1).
- Produces: `const wikiLinkExtension: MarkdownConfig`; `wikiLinkHandlers: Record<string, NodeHandler>` exported from `nodes/links.ts` alongside `linkHandlers`. Node names: `WikiLink` (whole construct), `WikiLinkMark` (`[[` and `]]`), `WikiLinkAlias` (`|alias` including the pipe).

- [ ] **Step 1: Add the Lezer Markdown dependency**

```bash
pnpm --filter @thinkbrain/desktop add @lezer/markdown@^1.6.4
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/desktop/src/tabs/livePreview/wikiLink.test.ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "./harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

describe("wiki link live preview", () => {
  it("shows only the target when the cursor is elsewhere", () => {
    preview = mountPreview("see [[My Note]] now", 0);
    expect(preview.lineText(1)).toBe("see My Note now");
  });

  it("shows the alias rather than the target when one is given", () => {
    preview = mountPreview("see [[My Note|the note]] now", 0);
    expect(preview.lineText(1)).toBe("see the note now");
  });

  it("reveals the full source when the cursor is inside", () => {
    preview = mountPreview("see [[My Note]] now", 8);
    expect(preview.lineText(1)).toBe("see [[My Note]] now");
  });

  it("styles the visible text as a link", () => {
    preview = mountPreview("see [[My Note]] now", 0);
    expect(preview.view.dom.querySelector(".cm-link-text")).not.toBeNull();
  });

  it("leaves an unterminated wiki link alone", () => {
    preview = mountPreview("see [[My Note now", 0);
    expect(preview.lineText(1)).toBe("see [[My Note now");
  });

  it("never alters the document", () => {
    preview = mountPreview("see [[My Note|the note]] now", 0);
    expect(preview.view.state.doc.toString()).toBe("see [[My Note|the note]] now");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- wikiLink`
Expected: FAIL — brackets still rendered.

- [ ] **Step 4: Write the inline parser**

```ts
// apps/desktop/src/tabs/livePreview/wikiLink.ts
import type { InlineContext, MarkdownConfig } from "@lezer/markdown";

/**
 * Lezer inline parser for `[[Target]]` and `[[Target|alias]]`.
 *
 * Registered `before: "Link"` so `[[` is claimed here rather than being read
 * as a link containing a nested bracket. Unterminated openers return -1 and
 * fall through to normal Markdown parsing untouched.
 */

const OPEN_BRACKET = 91; // "["
const CLOSE_BRACKET = 93; // "]"
const PIPE = 124; // "|"

export const wikiLinkExtension: MarkdownConfig = {
  defineNodes: [{ name: "WikiLink" }, { name: "WikiLinkMark" }, { name: "WikiLinkAlias" }],
  parseInline: [
    {
      name: "WikiLink",
      before: "Link",
      parse(cx: InlineContext, next: number, pos: number): number {
        if (next !== OPEN_BRACKET || cx.char(pos + 1) !== OPEN_BRACKET) return -1;

        let scan = pos + 2;
        let pipe = -1;
        while (scan < cx.end) {
          const ch = cx.char(scan);
          // A newline ends the candidate: wiki links do not span lines.
          if (ch === 10) return -1;
          if (ch === PIPE && pipe === -1) pipe = scan;
          if (ch === CLOSE_BRACKET && cx.char(scan + 1) === CLOSE_BRACKET) break;
          scan++;
        }
        if (scan >= cx.end) return -1;
        // Reject `[[]]`, which has no target.
        if (scan === pos + 2) return -1;

        const end = scan + 2;
        const children = [
          cx.elt("WikiLinkMark", pos, pos + 2),
          cx.elt("WikiLinkMark", scan, end)
        ];
        if (pipe !== -1) children.splice(1, 0, cx.elt("WikiLinkAlias", pipe, scan));

        return cx.addElement(cx.elt("WikiLink", pos, end, children));
      }
    }
  ]
};
```

- [ ] **Step 5: Write the wiki link handler**

Append to `apps/desktop/src/tabs/livePreview/nodes/links.ts`:

```ts
/**
 * `[[Target]]` / `[[Target|alias]]`.
 *
 * With an alias, the target and the pipe are concealed and the alias shows;
 * without one, only the brackets are concealed.
 */
const wikiLink: NodeHandler = (node, ctx) => {
  const marks = node.node.getChildren("WikiLinkMark");
  if (marks.length < 2) return;

  const [open, close] = marks;
  const alias = node.node.getChild("WikiLinkAlias");
  const textFrom = alias ? alias.from + 1 : open.to;
  const textTo = alias ? alias.to : close.from;

  ctx.present(Decoration.mark({ class: "cm-link-text" }), textFrom, textTo);

  const revealed = selectionTouchesRange(ctx.state, node.from, node.to);
  ctx.conceal(open.from, textFrom, revealed);
  ctx.conceal(textTo, close.to, revealed);
};

export const wikiLinkHandlers: Record<string, NodeHandler> = {
  WikiLink: wikiLink
};
```

- [ ] **Step 6: Register the handler and the parser**

In `handlers.ts`, import and spread `...wikiLinkHandlers`.

In `harness.ts`, change the Markdown extension to register the parser:

```ts
import { wikiLinkExtension } from "./wikiLink";
```

```ts
        markdown({ base: markdownLanguage, extensions: [wikiLinkExtension] }),
```

In `markdownEditorHooks.ts`, update the `markdown-language` hook the same way
and add the import:

```ts
import { wikiLinkExtension } from "./livePreview/wikiLink";
```

```ts
      extensions: () => [
        markdown({
          base: markdownLanguage,
          codeLanguages: languages,
          // Registered unconditionally: parsing `[[Target]]` correctly is
          // right even when live preview is off.
          extensions: [wikiLinkExtension]
        })
      ]
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @thinkbrain/desktop test -- wikiLink`
Expected: PASS — 6 tests.

- [ ] **Step 8: QA and hand off**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @thinkbrain/desktop test`
Recommended commit message: `feat(editor): parse and live-preview wiki links`

---

### Task 10: Cursor traversal and document integrity

A cross-cutting guard task rather than a new feature: prove that concealment never traps the cursor and never changes bytes.

**Files:**
- Create: `apps/desktop/src/tabs/livePreview/integrity.test.ts`
- Modify: whichever handler the tests expose as wrong (no change expected)

**Interfaces:**
- Consumes: `mountPreview` (Task 3); every handler from Tasks 4–9.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/tabs/livePreview/integrity.test.ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "./harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

const SAMPLE = [
  "---",
  "title: Sample",
  "---",
  "",
  "# Heading",
  "",
  "Text with **bold**, *italic*, ~~strike~~ and `code`.",
  "",
  "> A quote",
  "",
  "- [ ] task",
  "- item",
  "",
  "A [link](https://example.com) and a [[Wiki Page]].",
  "",
  "```js",
  "let a = 1;",
  "```",
  "",
  "---",
  ""
].join("\n");

describe("live preview document integrity", () => {
  it("leaves the document byte-identical after visiting every position", () => {
    preview = mountPreview(SAMPLE, 0);
    for (let pos = 0; pos <= SAMPLE.length; pos++) {
      preview.setCursor(pos);
    }
    expect(preview.view.state.doc.toString()).toBe(SAMPLE);
  });

  it("registers concealed markers as atomic so the cursor cannot land inside", () => {
    // "## hi": with the cursor after the heading text, moving left must skip
    // the concealed "## " in one step rather than entering it.
    preview = mountPreview("x\n\n## hi", 8);
    preview.setCursor(6);
    const before = preview.view.state.selection.main.head;
    preview.view.dispatch({
      selection: { anchor: preview.view.moveByChar(preview.view.state.selection.main, false).head }
    });
    const after = preview.view.state.selection.main.head;
    expect(after).toBeLessThan(before);
    // The concealed range is 3..6 (the "## " prefix at doc offset 3).
    expect(after).not.toBeGreaterThan(3);
  });
});
```

- [ ] **Step 2: Run test to verify it passes or exposes a bug**

Run: `pnpm --filter @thinkbrain/desktop test -- integrity`
Expected: PASS. If the atomic assertion fails, the `provide` block in
`index.ts` is not wiring `EditorView.atomicRanges` — fix that rather than the
test.

- [ ] **Step 3: QA and hand off**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @thinkbrain/desktop test`
Recommended commit message: `test(editor): guard live-preview integrity and cursor traversal`

---

### Task 11: Wire live preview into the editor

**Files:**
- Modify: `apps/desktop/src/tabs/markdownEditorHooks.ts`
- Modify: `apps/desktop/src/tabs/MarkdownEditor.tsx`
- Test: `apps/desktop/src/tabs/MarkdownEditor.test.tsx` (extend)

**Interfaces:**
- Consumes: `livePreview`, `LivePreviewOptions` (Task 3).
- Produces:
  - `MarkdownEditorHookPayload` gains `readonly livePreviewCompartment: Compartment`, `readonly livePreviewEnabled: boolean`, `readonly resolveAssetUrl?: (src: string) => string | null`.
  - `MarkdownEditorProps` gains `readonly livePreview?: boolean` (default `true`) and `readonly resolveAssetUrl?: (src: string) => string | null`.

- [ ] **Step 1: Write the failing test**

Append to `apps/desktop/src/tabs/MarkdownEditor.test.tsx`:

```ts
  it("renders markdown formatted when live preview is enabled", async () => {
    await mount(<MarkdownEditor value={"## hi\n\nbody"} onChange={() => {}} onSave={() => {}} />);
    const firstLine = container.querySelector(".cm-line");
    expect(firstLine?.textContent).toBe("hi");
  });

  it("shows raw source when live preview is disabled", async () => {
    await mount(
      <MarkdownEditor
        value={"## hi\n\nbody"}
        livePreview={false}
        onChange={() => {}}
        onSave={() => {}}
      />
    );
    const firstLine = container.querySelector(".cm-line");
    expect(firstLine?.textContent).toBe("## hi");
  });
```

Reuse whatever `mount` / `container` helpers already exist in that file; if the
existing tests inline their setup, follow the same shape rather than
introducing a new one.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- MarkdownEditor`
Expected: FAIL — the first line reads `## hi` in both cases.

- [ ] **Step 3: Extend the hook payload and add the hook**

In `markdownEditorHooks.ts`, add the imports:

```ts
import type { Compartment } from "@codemirror/state";
import { livePreview } from "./livePreview";
```

Extend the payload interface:

```ts
export interface MarkdownEditorHookPayload {
  /** Reports a CodeMirror document change to the controlled React value. */
  readonly onChange: (value: string) => void;
  /** Requests persistence of the current document. */
  readonly onSave: () => void;
  /**
   * Per-view compartment holding the live-preview extension.
   *
   * Owned by the editor instance rather than this module so two open editors
   * can be reconfigured independently.
   */
  readonly livePreviewCompartment: Compartment;
  /** Whether live preview is on at mount time. */
  readonly livePreviewEnabled: boolean;
  /** Resolves relative image sources; omitted outside a workspace. */
  readonly resolveAssetUrl?: (src: string) => string | null;
}
```

Add this hook to the registry array, between `markdown-language` (20) and
`line-wrapping` (30):

```ts
    {
      id: "markdown-live-preview",
      order: 25,
      extensions: (payload) => [
        payload.livePreviewCompartment.of(
          payload.livePreviewEnabled
            ? livePreview({ resolveAssetUrl: payload.resolveAssetUrl })
            : []
        )
      ]
    },
```

- [ ] **Step 4: Wire the component**

In `MarkdownEditor.tsx`, add `Compartment` to the `@codemirror/state` import,
extend the props:

```ts
export interface MarkdownEditorProps {
  readonly value: string;
  readonly isSaving?: boolean;
  readonly error?: string | null;
  /** Renders Markdown formatted inline, revealing source at the cursor. */
  readonly livePreview?: boolean;
  /** Resolves relative image sources to loadable URLs. */
  readonly resolveAssetUrl?: (src: string) => string | null;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
}
```

destructure `livePreview = true` and `resolveAssetUrl` in the signature, and
add a stable compartment plus a reconfigure effect:

```ts
  const livePreviewCompartment = useRef(new Compartment()).current;
  const livePreviewRef = useRef(livePreview);
  const resolveAssetUrlRef = useRef(resolveAssetUrl);

  useEffect(() => {
    resolveAssetUrlRef.current = resolveAssetUrl;
  }, [resolveAssetUrl]);
```

Pass the new fields when building the payload in the mount effect:

```ts
    const payload: MarkdownEditorHookPayload = {
      onChange: (nextValue) => onChangeRef.current(nextValue),
      onSave: () => onSaveRef.current(),
      livePreviewCompartment,
      livePreviewEnabled: livePreviewRef.current,
      resolveAssetUrl: (src) => resolveAssetUrlRef.current?.(src) ?? null
    };
```

and add the reconfigure effect after the value-sync effect:

```ts
  useEffect(() => {
    livePreviewRef.current = livePreview;
    const view = viewRef.current;
    if (!view) return;
    // Reconfiguring the compartment swaps the extension without recreating the
    // state, so the cursor, scroll position and undo history all survive.
    view.dispatch({
      effects: livePreviewCompartment.reconfigure(
        livePreview
          ? livePreviewExtension({ resolveAssetUrl: (src) => resolveAssetUrlRef.current?.(src) ?? null })
          : []
      )
    });
  }, [livePreview, livePreviewCompartment]);
```

with the import `import { livePreview as livePreviewExtension } from "./livePreview";`
(aliased because `livePreview` is now a prop name in this scope).

- [ ] **Step 5: Keep source mode monospace**

The base wrapper class already sets `font-mono`; the live-preview theme
overrides `.cm-content` to `--tn-font-sans`, so no change is needed in
`MarkdownEditor.tsx:92`. Verify by eye in Task 14 that toggling the setting
swaps the font.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @thinkbrain/desktop test -- MarkdownEditor`
Expected: PASS — including the two new tests.

- [ ] **Step 7: QA and hand off**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @thinkbrain/desktop test`
Recommended commit message: `feat(editor): mount live preview behind a compartment`

---

### Task 12: Settings toggle and palette command

**Files:**
- Modify: `packages/core/src/settings/modules/editor.ts`
- Modify: `apps/desktop/src/settings/settingsStore.ts`
- Modify: `apps/desktop/src/commands/commandRegistry.ts`
- Modify: `apps/desktop/src/shell/TabContent.tsx`
- Modify: `apps/desktop/src/shell/DesktopShell.tsx`
- Test: `packages/core/src/settings/registry.test.ts` (extend)
- Test: `apps/desktop/src/settings/settingsStore.test.ts` (extend)

**Interfaces:**
- Consumes: `MarkdownEditorProps.livePreview` (Task 11).
- Produces:
  - Setting key `editor.livePreview`, boolean, default `true`, scope `app`, section `editor.display`.
  - Store action `setSettingImmediately(key: string, value: unknown): Promise<void>`.
  - Command id `"toggle-live-preview"`; `DesktopCommandContext` gains `readonly toggleLivePreview: () => void`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/settings/registry.test.ts — append inside the existing describe
  it("registers the live preview editor setting", () => {
    const registry = createSettingsRegistry();
    registry.register(editorModule);
    const definition = registry.getDefinition("editor.livePreview");
    expect(definition?.type).toBe("boolean");
    expect(definition?.default).toBe(true);
    expect(definition?.section).toBe("editor.display");
  });
```

Match the existing file's import list and registry construction; if it already
builds a shared registry in a `beforeEach`, reuse that instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @thinkbrain/core test -- registry`
Expected: FAIL — `definition` is `undefined`.

- [ ] **Step 3: Add the setting**

In `packages/core/src/settings/modules/editor.ts`, add to the
`editor.display` section's `settings` array, after `lineWrapping`:

```ts
        {
          key: "livePreview",
          type: "boolean",
          default: true,
          scope: "app",
          section: "editor.display",
          label: "Live preview",
          description:
            "Render Markdown formatted inline, showing raw syntax only where the cursor is."
        }
```

- [ ] **Step 4: Add the immediate-persist store action**

In `apps/desktop/src/settings/settingsStore.ts`, add to the store interface:

```ts
  /**
   * Stages a single setting and saves immediately.
   *
   * Used by palette commands, where there is no Save bar to press. Any other
   * staged edits are persisted alongside it — acceptable because the Settings
   * tab and the palette are not usually driven at the same time.
   */
  setSettingImmediately(key: string, value: unknown): Promise<void>;
```

and to the implementation object, next to `getEffectiveValue`:

```ts
    async setSettingImmediately(key: string, value: unknown): Promise<void> {
      get().stageChange(key, value);
      await get().saveSettings();
    },
```

- [ ] **Step 5: Register the command**

In `apps/desktop/src/commands/commandRegistry.ts`, add `"toggle-live-preview"`
to the `DesktopCommandId` union, add to `DesktopCommandContext`:

```ts
  readonly toggleLivePreview: () => void;
```

and register the command alongside the other `toggle-*` entries, following the
exact shape the neighbouring `available({...})` calls use:

```ts
  available({
    id: "toggle-live-preview",
    label: "Toggle live preview",
    keywords: ["markdown", "wysiwyg", "preview", "source"],
    run: (context) => {
      context.toggleLivePreview();
      context.closePalette();
    }
  }),
```

- [ ] **Step 6: Read the setting and pass it down**

In `TabContent.tsx`, add the import and read the effective value:

```ts
import { useSettingsStore } from "../settings/settingsStore";
```

```ts
  const livePreview = useSettingsStore(
    (state) => state.getEffectiveValue("editor.livePreview") !== false
  );
```

and pass `livePreview={livePreview}` to the `<MarkdownEditor …/>` element.

In `DesktopShell.tsx`, implement the context callback next to the other
`toggle*` handlers:

```ts
  const toggleLivePreview = useCallback(() => {
    const store = useSettingsStore.getState();
    const current = store.getEffectiveValue("editor.livePreview") !== false;
    void store.setSettingImmediately("editor.livePreview", !current);
  }, []);
```

and include `toggleLivePreview` in the object passed as the command context.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @thinkbrain/core test && pnpm --filter @thinkbrain/desktop test`
Expected: PASS.

- [ ] **Step 8: QA and hand off**

Run: `pnpm lint && pnpm typecheck`
Recommended commit message: `feat(settings): add live preview toggle setting and command`

---

### Task 13: Vault-relative image resolution

**Files:**
- Create: `apps/desktop/src/native/assets.ts`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src/shell/TabContent.tsx`
- Test: `apps/desktop/src/native/assets.test.ts`

**Interfaces:**
- Consumes: `MarkdownEditorProps.resolveAssetUrl` (Task 11).
- Produces: `createVaultAssetResolver(rootPath: string, notePath: string): (src: string) => string | null`

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/native/assets.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURI(path)}`
}));

const { createVaultAssetResolver } = await import("./assets");

describe("createVaultAssetResolver", () => {
  const resolve = createVaultAssetResolver("/vault", "notes/today.md");

  it("resolves a path relative to the note", () => {
    expect(resolve("img/cat.png")).toBe("asset://localhost//vault/notes/img/cat.png");
  });

  it("resolves a vault-absolute path", () => {
    expect(resolve("/assets/cat.png")).toBe("asset://localhost//vault/assets/cat.png");
  });

  it("refuses to escape the vault root", () => {
    expect(resolve("../../etc/passwd")).toBeNull();
  });

  it("returns null for an empty source", () => {
    expect(resolve("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test -- assets`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the adapter**

```ts
// apps/desktop/src/native/assets.ts
import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Turns a Markdown image source into a URL the webview can load.
 *
 * Lives in `native/` because it is the only part of live preview that knows
 * Tauri exists; the editor extension takes it as an injected callback.
 */

/** Normalizes a POSIX-ish path, resolving `.` and `..` segments. */
function normalizeSegments(path: string): string[] | null {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      // Escaping the vault root is refused rather than clamped: a note that
      // reaches outside its vault is a mistake worth surfacing, not hiding.
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out;
}

/**
 * Builds a resolver for one open note.
 *
 * @param rootPath Absolute path of the workspace root.
 * @param notePath Note path relative to `rootPath`.
 * @returns A resolver returning an asset URL, or `null` when unresolvable.
 */
export function createVaultAssetResolver(
  rootPath: string,
  notePath: string
): (src: string) => string | null {
  const noteDirectory = notePath.split("/").slice(0, -1).join("/");

  return (src: string): string | null => {
    if (!src) return null;

    const relative = src.startsWith("/")
      ? src.slice(1)
      : noteDirectory
        ? `${noteDirectory}/${src}`
        : src;

    const segments = normalizeSegments(relative);
    if (!segments || segments.length === 0) {
      console.error(`[assets] refusing to resolve image outside the vault: ${src}`);
      return null;
    }

    return convertFileSrc(`${rootPath}/${segments.join("/")}`);
  };
}
```

- [ ] **Step 4: Enable the asset protocol**

In `apps/desktop/src-tauri/tauri.conf.json`, replace the `security` block
(currently at line 21–23):

```json
    "security": {
      "csp": null,
      "assetProtocol": {
        "enable": true,
        "scope": ["**"]
      }
    }
```

A `**` scope is required because vaults live at arbitrary user-chosen paths.
This grants the webview file reads through `asset://`, which is consistent with
the `fs:default` permission the app already holds.

- [ ] **Step 5: Pass the resolver from TabContent**

In `TabContent.tsx`, build the resolver from the active tab's resource and pass
it to the editor:

```ts
import { useMemo } from "react";
import { createVaultAssetResolver } from "../native/assets";
```

```ts
  const rootPath = tab?.resource?.rootPath;
  const relativePath = tab?.resource?.relativePath;
  const resolveAssetUrl = useMemo(
    () => (rootPath && relativePath ? createVaultAssetResolver(rootPath, relativePath) : undefined),
    [rootPath, relativePath]
  );
```

and add `resolveAssetUrl={resolveAssetUrl}` to the `<MarkdownEditor …/>`
element. Hooks must be called before the early `return`s in this component —
move them to the top of the function body.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @thinkbrain/desktop test -- assets`
Expected: PASS — 4 tests.

- [ ] **Step 7: QA and hand off**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @thinkbrain/desktop test`
Recommended commit message: `feat(editor): resolve vault-relative images via asset protocol`

---

### Task 14: Demo page

A browser-openable page importing the real modules, so the demo cannot drift
from shipped behavior and does not need Tauri.

**Files:**
- Create: `apps/desktop/demo/live-preview.html`
- Create: `apps/desktop/demo/main.tsx`
- Modify: `apps/desktop/tsconfig.json` (include `demo`)

**Interfaces:**
- Consumes: `livePreview` (Task 3), `wikiLinkExtension` (Task 9).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Write the demo page**

```html
<!-- apps/desktop/demo/live-preview.html -->
<!doctype html>
<html lang="en" data-thinkbrain-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Markdown Live Preview — Demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the demo entry**

```tsx
// apps/desktop/demo/main.tsx
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

import { livePreview } from "../src/tabs/livePreview";
import { wikiLinkExtension } from "../src/tabs/livePreview/wikiLink";
import "../src/index.css";

/**
 * Standalone live-preview demo.
 *
 * Imports the same modules the app mounts, so what renders here is exactly
 * what ships. Served by the existing dev server at /demo/live-preview.html —
 * no Tauri required, which is the point: `pnpm dev` alone cannot open a
 * workspace file.
 */

const SAMPLE = [
  "---",
  "title: Live preview demo",
  "tags: [markdown, codemirror]",
  "---",
  "",
  "# Markdown, live",
  "",
  "Move the cursor onto any construct to see its raw markdown. Move away and",
  "the formatting takes over.",
  "",
  "## How it works",
  "",
  "Renders **bold**, *italic*, ~~strikethrough~~ and `inline code` as you type.",
  "",
  "> Blockquotes stay quiet until you need to edit them.",
  "",
  "- [ ] Try checking this box",
  "- [x] This one is already done",
  "- Regular list items work too",
  "",
  "1. Numbered lists",
  "2. keep their markers",
  "",
  "Read about [CodeMirror 6](https://codemirror.net/), or link to [[Another Note]]",
  "and [[Another Note|an aliased note]].",
  "",
  "```js",
  'console.log("code blocks stay monospaced and highlighted");',
  "```",
  "",
  "---",
  ""
].join("\n");

const parent = document.getElementById("root");
if (!parent) throw new Error("[demo] #root missing");

new EditorView({
  parent,
  state: EditorState.create({
    doc: SAMPLE,
    extensions: [
      history(),
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        extensions: [wikiLinkExtension]
      }),
      EditorView.lineWrapping,
      // Remote-only resolver: the demo has no vault to resolve against.
      livePreview({ resolveAssetUrl: () => null }),
      keymap.of([...defaultKeymap, ...historyKeymap])
    ]
  })
});
```

- [ ] **Step 3: Include the demo in typechecking**

Add `"demo"` to the `include` array in `apps/desktop/tsconfig.json`. Do not add
it to `vite.config.ts` `rollupOptions.input` — the demo is a dev-only page and
stays out of the production build.

- [ ] **Step 4: Verify in a browser**

Run: `pnpm --filter @thinkbrain/desktop dev`
Open: `http://127.0.0.1:1420/demo/live-preview.html`

Check by eye, and fix anything that fails:
- Headings render sized with no `#` visible; clicking one reveals its `##`.
- Bold/italic/strike/code markers hide and reveal per node, not per line.
- The frontmatter block is dimmed and monospace, and `title:` is *not* a heading.
- Checkboxes are clickable and flip the source.
- The code block is highlighted; both fences are hidden until the cursor is on them.
- Wiki links show the target, and the aliased one shows the alias.
- Arrow-keying across the whole document never stalls on an invisible character.

- [ ] **Step 5: QA and hand off**

Run: `pnpm lint && pnpm typecheck`
Recommended commit message: `feat(demo): add live-preview demo page`

---

### Task 15: End-to-end coverage and story closeout

**Files:**
- Create: `apps/desktop/e2e/live-preview.spec.ts`
- Modify: `plans/ui-shell/pending-semi_preview_editor-med-hard.md` → rename to `done-semi_preview_editor-med-hard.md`

**Interfaces:**
- Consumes: everything.
- Produces: nothing.

- [ ] **Step 1: Write the E2E test**

Follow the setup the existing specs in `apps/desktop/e2e/` use for opening a
workspace and a note — read one before writing this, and reuse its fixture
rather than inventing a new one.

```ts
// apps/desktop/e2e/live-preview.spec.ts
import { expect, test } from "@playwright/test";

test.describe("markdown live preview", () => {
  test("reveals markdown source when the cursor enters a heading", async ({ page }) => {
    // Replace with this suite's existing workspace/note fixture.
    await page.goto("/demo/live-preview.html");

    const heading = page.locator(".cm-h1").first();
    await expect(heading).toHaveText("Markdown, live");

    await heading.click();
    await expect(heading).toHaveText("# Markdown, live");
  });

  test("toggles a task checkbox from the rendered checkbox", async ({ page }) => {
    await page.goto("/demo/live-preview.html");

    const checkbox = page.locator(".cm-task-checkbox").first();
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  });
});
```

- [ ] **Step 2: Run the E2E test**

Run: `pnpm --filter @thinkbrain/desktop test:e2e -- live-preview`
Expected: PASS — 2 tests.

- [ ] **Step 3: Run the full QA suite**

Run: `./scripts/qa.sh`
Expected: lint, typecheck and all unit tests pass.

- [ ] **Step 4: Close out the story**

Tick every acceptance criterion in
`plans/ui-shell/pending-semi_preview_editor-med-hard.md` that now holds, then
rename the file to `done-semi_preview_editor-med-hard.md` per the repo's plan
status convention.

- [ ] **Step 5: QA and hand off**

Recommended commit message: `test(editor): add live-preview e2e coverage and close story`

Report to the user: what works, anything that degraded (particularly whether
vault-relative images resolved under Tauri), and manual test steps.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: module layout → Tasks 1–9;
decoration engine → Task 3; reveal rules → Task 1, applied per handler;
feature-coverage table → Tasks 3–9 (headings, emphasis, code, blockquotes,
rules, lists, tasks, links, images, wiki links, frontmatter); typography →
Tasks 3 and 11; toggle → Task 12; demo → Task 14; testing → Tasks 1–10 plus 15;
image asset protocol risk → Task 13.

**Two known gaps, deliberately left open.** The spec's feature table lists GFM
*table* header/alignment styling, which no task implements — Task 4 enables the
GFM parser so tables parse, but no `Table` handler is written. Tables are the
lowest-value item in the spec and the only one whose absence degrades to plain
text rather than to something broken. Second, the spec mentions concealed
markers being *dimmed* when revealed; that is implemented via `cm-syntax-mark`
in Task 3's `conceal`, styled in Task 3's theme. If table styling is wanted,
add it as a follow-up story rather than growing this plan.

**Placeholder scan.** No TBD/TODO markers; every code step carries real code.
Three steps intentionally defer to existing repo conventions rather than
inventing them (Task 11 Step 1 on the `mount` helper, Task 12 Step 1 on the
registry fixture, Task 15 Step 1 on the E2E workspace fixture) — each says so
explicitly and names the file to read first.

**Type consistency.** `NodeHandler` and `DecorateContext` are defined once in
Task 3 and consumed unchanged thereafter; `replaceWith` is added to the context
in Task 7 before its first use in the same task, and reused in Task 8.
`LivePreviewOptions.resolveAssetUrl` has the signature
`(src: string) => string | null` in Task 3, Task 11 and Task 13 alike.
`mountPreview(source, cursor?, options?)` is defined in Task 3 and every later
call matches. `findFrontmatterRange` returns `firstLine`/`lastLine`, and Task 3
consumes `lastLine`.

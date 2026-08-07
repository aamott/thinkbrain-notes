import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { livePreview } from "../src/tabs/livePreview";
import { wikiLinkExtension } from "../src/tabs/livePreview/wikiLink";
// Token definitions first, then the Tailwind entry that maps them — the same
// order `src/main.tsx` uses. Without the tokens every --tn-* var is undefined
// and the editor renders unstyled.
import "@thinkbrain/ui/styles.css";
import "../src/index.css";

/**
 * Standalone live-preview demo.
 *
 * Imports the same modules the app mounts, so what renders here is exactly
 * what ships. Served by the existing dev server at /demo/live-preview.html —
 * no Tauri required, which is the point: `pnpm dev` alone cannot open a
 * workspace file, so this is the only way to see the editor in a plain
 * browser.
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
  "| Construct | Reveals on |",
  "| --- | --- |",
  "| `## heading` | the line |",
  "| `**bold**` | that node |",
  "",
  "```js",
  'console.log("code blocks stay monospaced and highlighted");',
  "```",
  "",
  "---",
  ""
].join("\n");

/**
 * `?headings=N` appends N extra headings, which pushes the document past what
 * CodeMirror parses in one go. Used by the e2e suite to cover incremental
 * parsing — a behaviour that cannot be observed in a headless DOM, because
 * without layout the viewport, not the syntax tree, caps the decorations.
 */
const extraHeadings = Number(new URLSearchParams(location.search).get("headings") ?? "0");
const doc =
  extraHeadings > 0
    ? `${SAMPLE}\n${Array.from({ length: extraHeadings }, (_, i) => `## Filler ${i}`).join("\n\n")}`
    : SAMPLE;

const parent = document.getElementById("root");
if (!parent) throw new Error("[demo] #root missing");

parent.className = "mx-auto my-10 max-w-[52rem] rounded-xl border border-border bg-editor";

new EditorView({
  parent,
  state: EditorState.create({
    doc,
    extensions: [
      history(),
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        extensions: [wikiLinkExtension]
      }),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": { color: "var(--tn-color-editor-foreground)" },
        ".cm-content": { padding: "2rem 2.5rem 3rem" },
        "&.cm-focused": { outline: "none" }
      }),
      // Remote-only resolver: the demo has no vault to resolve against.
      livePreview({ resolveAssetUrl: () => null }),
      keymap.of([...defaultKeymap, ...historyKeymap])
    ]
  })
});

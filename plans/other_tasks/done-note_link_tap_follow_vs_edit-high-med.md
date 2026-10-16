# Story: Tap-to-follow vs edit note links

Live preview conceals a link's Markdown syntax until the selection touches it.
Owner rule: **when the syntax is hidden, a tap/click follows the link; when the
syntax is showing (cursor in or selection dragged into the link), the tap
edits.** Same rule on desktop and phone — "tap" and "click" are one gesture.

Today: resolved `[[wiki]]` links follow on every click, even while revealed
(`livePreview/index.ts` click handler). `[text](target)` Markdown links never
follow at all (`livePreview/nodes/links.ts` — "deliberately not implemented").

## Decisions (made with owner)

- Scope: `[[wiki]]` links, inline `[text](target)` links, external URLs.
- External `http(s)://` (and other non-vault schemes like `mailto:`) open via a
  new `openUrl` adapter in `apps/desktop/src/native/` backed by
  `tauri-plugin-opener` (`open_url`). Add the plugin + capability if absent —
  `workspace-explorer/non_markdown_file_ops` plans the same plugin for
  `shell.open`, so reuse whatever exists when this lands.
- Internal link targets resolve relative to the containing note's folder.
  `.md` → `openMarkdownDocument` preview tab; other resolvable files →
  `openFileDocument` preview tab. `#anchor` suffixes resolve the file part
  only; scrolling to a heading is a separate story.
- Unresolved internal targets get the same `cm-link-broken` treatment wiki
  links have and are not followable — a tap edits.
- Out of scope: bare autolinks/URLs in prose, heading-anchor scrolling.

## Acceptance

- [x] Tap on a concealed resolved wiki link follows it (current behavior kept);
      tap on the same link while its syntax is revealed places the cursor and
      does not follow.
- [x] Tap on a concealed `[text](target)` link follows: vault-relative target →
      preview tab (Markdown or file viewer); `http(s)`/other external scheme →
      `openUrl` native adapter. Revealed link → tap edits.
- [x] A drag that ends on a link (selection gesture) never follows, even when
      the link was concealed at gesture start.
- [x] Broken/unresolved links and links inside code spans/blocks are never
      followable; tapping them edits.
- [x] Mod+click (Ctrl/Cmd) follows either link type even when revealed;
      `Mod-Enter` inside a Markdown link follows like it already does for wiki
      links — source mode keeps the binding too.
- [x] With live preview off (source mode), plain click always edits; Mod+click
      still follows.
- [x] `openUrl` reaches the OS through `native/` only; `native/opener.test.ts`
      mocks the bridge and asserts dispatch + normalized rejection. Only
      `https?`/`mailto`/`tel` schemes reach the OS — `javascript:`/`data:`/
      `file:`/`ftp:` resolve to nothing and render broken.
- [x] Live-preview tests cover follow-vs-edit for wiki and Markdown links at
      the reveal boundary; `pnpm qa` green.

Relevant seams: `apps/desktop/src/tabs/livePreview/index.ts` (click + Mod-Enter
handlers), `livePreview/nodes/links.ts` (link decorations, resolved/broken
classes), `livePreview/reveal.ts` (`selectionTouchesRange`), `tabs/MarkdownEditor.tsx`
and `markdownEditorHooks.ts` (`onOpenNote` plumbing), `shell/useShellState.ts`
(`onOpenNote` → preview tab), `native/commands.ts` (add `openUrl`).

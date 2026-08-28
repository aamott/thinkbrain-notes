# Generic File Viewer Tabs

## Goal

Register new tab kinds so the shell can open non-Markdown files in appropriate
in-app viewers instead of only supporting Markdown editing.

## Tab Kinds

| Tab Kind | File Types | Component | Editable? |
|---|---|---|---|
| `code-editor` | `.ts`, `.js`, `.json`, `.yaml`, `.css`, `.html`, `.py`, `.rs`, `.toml`, `.txt`, etc. | CodeMirror 6 (same engine as Markdown editor, different extensions) | Yes |
| `image-viewer` | `.png`, `.jpg`, `.gif`, `.svg`, `.webp` | `<img>` with Tauri asset protocol | No (view only) |
| `audio-viewer` | `.mp3`, `.ogg`, `.wav`, `.flac` | `<audio controls>` with Tauri asset protocol | No (view only) |
| `video-viewer` | `.mp4`, `.webm`, `.mov` | `<video controls>` with Tauri asset protocol | No (view only) |

## Media Rendering Decision

**Use Tauri Asset Protocol (`convertFileSrc`)** for all media types.

This was chosen over alternatives after evaluating:

- **Asset Protocol** ✅ — Zero JS heap overhead, native streaming from disk,
  scoped filesystem permissions, cross-platform. Handles files up to 100MB+
  without memory issues. Tauri v2 supports HTTP Range headers for video
  seeking.
- **Base64 blobs** ❌ — 33% payload inflation, 1.3–3× memory in V8 heap,
  risk of OOM crashes on large files. High maintenance burden for cleanup.
- **Custom IPC streaming** ❌ — Massive complexity for marginal benefit.
  `MediaSource` API support varies across webview engines.
- **Direct `file://`** ❌ — Blocked by Tauri's security sandbox.

## Acceptance Criteria

- [x] `tabRegistry.ts` registers `code-editor`, `image-viewer`,
      `audio-viewer`, and `video-viewer` as available tab kinds.
- [x] `tabModel.ts` exposes a helper to determine tab kind from file extension.
- [x] `CodeEditor` component wraps CodeMirror 6 with language-appropriate
      extensions (syntax highlighting for known languages, no Markdown-specific
      plugins). Supports read/write with the same save flow as `MarkdownEditor`.
- [x] `MediaViewers.tsx` exports `ImageViewer`, `AudioViewer`, and
      `VideoViewer` components that use `convertFileSrc` from
      `@tauri-apps/api/core` to stream local files.
- [x] `TabContent` in `DesktopShell.tsx` routes to the correct viewer
      component based on the tab's kind.
- [x] Media viewer tabs show a read-only indicator and have no save button.
- [x] Image viewer supports basic zoom (scroll wheel) and fit-to-container.

## Architecture Notes

- File extension → tab kind mapping lives in `packages/core` for reuse by
  future mobile app.
- CodeMirror language extensions are loaded lazily per-file to keep the initial
  bundle small.
- Media viewers are simple, thin wrappers. No custom media player UI unless
  explicitly requested later.

## Dependencies

- `workspace-explorer/pending-non_markdown_file_ops-med-med.md` owns the
  explorer click/routing changes that feed files into these viewers.

## Sequencing

The `code-editor` tab kind is the high-value piece and can ship independently
of the media viewers. Text/code editing only requires: the `code-editor` kind
in `BuiltInTabKind`, the `inferTabKind` helper, the `CodeEditor` component, and
`TabContent` routing. The media viewers (`image-viewer`, `audio-viewer`,
`video-viewer`) are separable and can be deferred without blocking
text/code editing.

# File Viewer Architecture — Brainstorm

## Goal

Explore the future direction of file viewer/editor architecture as the app
grows beyond the initial 5 tab kinds (editor, code-editor, image-viewer,
audio-viewer, video-viewer).

## Current State

- `inferTabKind` in `packages/core` maps extensions → tab kind via a lookup
  table. Unknown extensions fall back to `code-editor`.
- `TabContent.tsx` routes each kind to a component with lazy loading.
- `tabRegistry.ts` registers kinds with availability metadata.
- Rust `read_text_file`/`write_text_file` handle non-Markdown text I/O.
- Media viewers use Tauri's `convertFileSrc` asset protocol.

## Questions to Explore

### 1. Binary file handling
Currently binary files (`.pdf`, `.xlsx`, `.zip`, `.exe`) fail at the Rust
`read_text_file` level with `workspace.file_not_text`. Options:
- **Cheap**: Catch the error in the code-editor and show a friendly "binary
  file" message. No new tab kind.
- **Better**: Add an `unsupported-file` tab kind with known-binary extensions,
  routed to a clean "can't open" component without ever reading the file.
- **Future**: Specialized viewers for PDF, Office docs, etc. (heavy deps).

### 2. Specialized text viewers
Some text formats could have richer viewers:
- **CSV/TSV** — table view with sort/filter
- **HTML** — live preview pane alongside source
- **SVG** — render preview alongside XML source
- **Dockerfile/Makefile** — no special viewer needed, code-editor is fine

### 3. Plugin/extension system for viewers
At what point does adding tab kinds via `inferTabKind` + `TabContent` routing
become unwieldy? When should extensions be able to register their own viewers?
- Current pattern is simple and scales to ~10-15 kinds easily.
- An extension-contributed viewer registry would let third-party extensions
  add support for formats like `.drawio`, `.excalidraw`, `.mermaid`.
- Could reuse the existing `TabRegistry` with extension-contributed kinds.

### 4. Binary detection strategy
- Extension-based dispatch is simple but imperfect (a `.dat` file could be
  text or binary).
- Magic-byte sniffing is more robust but adds complexity.
- Recommendation: stick with extension-based for now, add a fallback "binary
  detected" error path for misclassified files.

### 5. Large file handling
- Text files >10MB may freeze the editor. Consider a size guard before
  loading, with a "file too large to edit" message.
- Media files stream via asset protocol, so size is less of a concern.

## Not Urgent

This is a brainstorming note, not an implementation plan. Pick items off this
list as they become relevant. The current architecture handles the common
cases well; don't over-engineer for hypothetical formats.

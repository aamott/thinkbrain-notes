# Core Package (`packages/core/`)

Platform-agnostic TypeScript data structures, workspace models, and Markdown parsing utilities.

## Module Map
- **`src/note-model.ts`**: Fundamental note data structures and types.
- **`src/markdown.ts`**: Markdown AST parsing & transformation functions.
- **`src/frontmatter.ts`**: YAML frontmatter extraction & serialization.
- **`src/settings.ts`**: Core workspace configuration models.
- **`src/layout/`**: Workspace layout models and serialization logic.
- **`src/index.ts`**: Package export entry point.

## Rules & Patterns
- **Platform Agnostic**: Strictly NO imports of React, DOM APIs, Node.js built-ins, or Tauri APIs.
- **Pure Functions**: Models and parsers must be deterministic and pure.
- **Exports**: All public models must be exported via `src/index.ts`.

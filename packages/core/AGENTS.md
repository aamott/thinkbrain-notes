# Core Package (`packages/core/`)

Platform-agnostic TypeScript data structures, models, and Markdown parsing logic.

## Module Map
- `src/note-model.ts`: Fundamental note data structures and types.
- `src/markdown.ts`: Markdown AST parsing & transformation functions.
- `src/frontmatter.ts`: YAML frontmatter extraction & serialization.
- `src/settings.ts`: Core workspace configuration models.
- `src/layout/`: Workspace layout models and serialization.
- `src/index.ts`: Package export entry point.

## Rules & Patterns
- **Platform Agnostic**: Strictly NO imports of React, DOM APIs, Node.js built-ins, or Tauri APIs.
- **Pure Functions**: Parser and model utilities should be deterministic and easy to unit test.
- **Exports**: All public models must be exported from `src/index.ts`.

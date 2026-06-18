# Testing Strategy

This document defines the expected validation approach for implementation agents.

## Test Types

## TypeScript Unit Tests

Use Vitest for frontend and shared TypeScript code.

Primary targets:

- Markdown/frontmatter parsing
- note metadata extraction
- path normalization
- settings load/save/migration logic
- search query helpers
- UI state reducers/stores

## Rust Unit Tests

Use `cargo test` for Tauri/Rust modules.

Primary targets:

- filesystem command behavior
- Git command wrappers
- SQLite/indexing helpers if implemented in Rust
- error handling

## Integration Tests

Use integration tests for flows that cross package boundaries.

Primary targets:

- open workspace -> list Markdown files
- parse note -> index note -> search note
- settings read/write round trip
- Git status parsing against a temporary repository

## End-to-End Tests

E2E testing should be set up from the initial scaffold.

Use Playwright for browser-level UI flows. Add Tauri-specific E2E coverage when the desktop shell is stable enough to support it reliably.

Core E2E journey:

1. Open workspace.
2. Create note.
3. Edit and save note.
4. Search for note.
5. View Git status.

## Expected Commands

Once the project is scaffolded, these commands should exist or have documented equivalents:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

For Rust/Tauri code:

```bash
cargo test
```

## Agent Validation Rule

Each work-item agent must run the narrowest relevant validation first. If that passes, run broader validation when practical.

Agents must report:

- commands run
- pass/fail status
- relevant failure output
- any validation they could not run and why

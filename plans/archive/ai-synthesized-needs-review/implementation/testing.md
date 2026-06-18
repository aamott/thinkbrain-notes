> [!WARNING]
> **AI Synthesized**: This file was synthesized by an AI agent based on conversational context. It was not explicitly written in the final chat summary and requires manual review.

# Testing Strategy

## Unit Tests
- Use Vitest for all frontend and shared packages.
- Use `cargo test` for backend Rust modules.
- Ensure cross-platform logic is tested thoroughly.

## Integration Tests
- Test SQLite interactions and Indexing pipelines using transient, in-memory databases.
- Test Markdown parsing and metadata extraction with varying levels of malformed input.

## End-to-End Tests
- Use Playwright to test the desktop application within the Tauri container.
- E2E tests should cover the core user journey: Open vault -> Create note -> Add text and links -> Search for note -> View in graph.

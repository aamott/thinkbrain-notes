# Mobile FileSystem Adapter

## Goal

Implement the mobile `FileSystemAdapter` against the core interface using
`expo-file-system`. Provide workspace listing, file read/write, create, rename,
and delete operations for Markdown files and workspace entries, mirroring the
desktop adapter's contract.

## Acceptance Criteria

- [ ] `FileSystemAdapter` implementation lives in `apps/mobile/src/adapters/`.
- [ ] Implements the `FileSystemAdapter` interface from `packages/core`.
- [ ] Supports: list workspace entries, read file, write file, create note,
      rename, delete.
- [ ] Workspace root path resolution works on mobile (document picker / app
      directory).
- [ ] Errors are typed and fail loudly (no silent swallowed failures).
- [ ] Unit tests cover path handling and error mapping where practical.

## References

- `packages/core/src/index.ts` — `MarkdownFileEntry`, `WorkspaceEntry`,
  `MarkdownFileContents` types
- `plans/pending-mobile-low-hard.md` — Platform adapter contract
- `plans/technical-decisions.md` — Storage, Repository Structure sections

# `assertRelativePath` is weaker than the native normalizer it mirrors

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/extensionWorkspace.ts`
- **Lines:** 56–71

## Description

The file's stated purpose is that a bad path "names the offending path rather
than surfacing as an opaque native error", but the JS check accepts several
shapes the authoritative Rust normalizer
(`workspace_paths.rs::normalize_relative_path_parts`, lines 200–233) rejects:

- empty/whitespace segments — `"a//b"`, `"a/ /b"` pass JS (`split` yields
  `""`/`" "` segments, neither is `".."`), Rust returns `EmptySegment`;
- `"."` alone or `"./x"` — `CurDir` components are allowed by JS, and `"."`
  reaches the native layer which rejects it as `Empty`;
- drive-relative `"C:file"` — `WINDOWS_ABSOLUTE` requires a slash after the
  colon, so it passes JS; on Windows Rust rejects it via `Component::Prefix`.

All are still caught natively, so this is error-quality drift, not an escape.
It also duplicates the absolute/`..` logic that `resolveEntryPath` in
`packages/core/src/extensions/loader.ts` performs — `pathGuards.ts` was
created precisely to keep these two copies from drifting, yet only
`WINDOWS_ABSOLUTE` is shared; the segment checks remain hand-copied.

## Recommendation

Mirror the Rust rules in `assertRelativePath` (reject empty/whitespace
segments, lone `.`, drive-relative prefixes) or — better — move a shared
`assertWorkspaceRelative`/`resolveRelative` guard into
`packages/core/src/extensions/pathGuards.ts` so both loaders consume the same
segment-level rules instead of a regex.

## Verification

Compared `assertRelativePath` (`extensionWorkspace.ts:57–71`) against
`normalize_relative_path_parts`
(`apps/desktop/src-tauri/src/commands/workspace_paths.rs:200–233`). The test
matrix (`extensionWorkspace.test.ts:87–101`) covers escapes but none of the
accepted-here/rejected-there shapes above.

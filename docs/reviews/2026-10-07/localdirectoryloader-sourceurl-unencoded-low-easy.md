# `sourceUrlFor` interpolates raw paths into a `sourceURL` comment

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/localDirectoryLoader.ts`
- **Lines:** 79–84 (and use site `desktopLocalDirectoryLoader.ts:43–45`)

## Description

`sourceUrlFor` concatenates the directory and entry path into a `file://` URL
with no encoding, and `createExtensionModuleImporter` appends it as
`//# sourceURL=${sourceUrl}`.

Two consequences:

1. A directory containing `#`, `?`, `%`, or spaces produces a malformed
   `sourceURL` label, so devtools and stack traces show a wrong or truncated
   path for a perfectly legal extension location.
2. Neither `resolveEntryPath` (core `loader.ts`) nor this layer rejects
   control characters in `main`. A `main` like `"ok.js\nBAD;x.js"` passes the
   `..`/absolute/`.js` checks, and its embedded newline terminates the
   `sourceURL` comment early, splicing the remainder into the evaluated
   module as a new line — producing a confusing `entry_import_failed`
   diagnostic (or, if it happens to be valid JS, extra executed code).

Not a privilege boundary — the extension author already controls the entire
bundle — but it turns a malformed manifest into misleading diagnostics and is
a cheap hardening fix.

## Recommendation

Percent-encode the components in `sourceUrlFor` (or build via `new URL`/`pathToFileURL`-style encoding) and strip/reject `\n` and `\r`. The stronger
fix is in core `resolveEntryPath` (`packages/core/src/extensions/loader.ts`,
outside this scope): reject control characters in `main` so every consumer
benefits.

## Verification

`resolveEntryPath` (`packages/core/src/extensions/loader.ts:55–87`) checks
absolute, `..`, and `\.m?js$` only — no control-character check.
`sourceUrlFor` does plain `${prefix}${normalized}/${relativePath}`
(`localDirectoryLoader.ts:80–84`), and the importer appends it raw at
`desktopLocalDirectoryLoader.ts:44`. Existing test at
`localDirectoryLoader.test.ts:47–58` pins the un-encoded format.

# Task: `DialogPath` branding for the unscoped fs bridge

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** med

> Residual from `docs/reviews/2026-08-13/native/native-fs-unscoped-paths`
> (finding deleted). The doc-comment half — restricting `native/fs.ts` to
> dialog-picked paths — already landed.

## Context

`fs:allow-read-text-file`/`fs:allow-write-text-file` in
`capabilities/desktop.json` have no path scope, and `native/fs.ts` accepts any
`string`. Only `settings/importExportFiles.ts` feeds it dialog-picked paths
today, but nothing stops a future caller from passing a derived path.

Option: a `DialogPath` branded type returned only by the dialog adapters, so
misuse fails typecheck rather than review. Churns ~4 test files.

## Acceptance

- [ ] `writeTextFileNative`/`readTextFileNative` cannot receive a plain string
      path — only one that came from a system dialog

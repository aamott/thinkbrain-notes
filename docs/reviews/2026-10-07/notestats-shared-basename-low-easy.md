# `noteStats.ts` / `noteStats.tsx` share a basename — forced `.tsx` import and ambiguous `./noteStats`

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/builtins/noteStats.tsx`
- **Lines:** 1–4 (and `index.ts:5–6`)

## Description

The extension is split across `noteStats.ts` (pure logic + manifest) and
`noteStats.tsx` (activation + UI). The split itself is sound — the pure half
stays testable without JSX — but the shared basename makes `builtins/index.ts`
write `import { activateNoteStats } from "./noteStats.tsx"` with an explicit
extension: a bare `./noteStats` always resolves to the `.ts` file. It works
only because `allowImportingTsExtensions` is on, and a reader can't tell from
the import site which of the two same-named modules provides what.

The same-basename pair also means any future `import from "./noteStats"`
silently picks the `.ts` module — a missed `activateNoteStats` import would be
a confusing failure rather than a missing file.

## Recommendation

Rename the non-JSX module so each file's name says what it holds, e.g.
`noteStatsModel.ts` (stats computation + manifest) imported by
`noteStats.tsx`, `noteStats.test.ts`, and `builtins/index.ts` — after which the
`.tsx` extension suffix on the activation import can be dropped. Three import
sites, all inside `builtins/`; no behavior change. Alternatively merge the two
files (~150 lines combined) — they are one extension and the split buys little
at this size.

## Verification

`builtins/index.ts:5–6` imports `noteStatsManifest` from `./noteStats` and
`activateNoteStats` from `./noteStats.tsx` — the only same-basename `.ts`/`.tsx`
pair in `src/`. All three consumers of the `.ts` module live in
`apps/desktop/src/extensions/builtins/`.

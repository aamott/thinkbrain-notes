# Split DesktopShell.tsx

## Goal

`apps/desktop/src/shell/DesktopShell.tsx` had grown past the 800-line limit in
AGENTS.md. Per `apps/desktop/src/AGENTS.md` it should be "a slim composition
orchestrator (state/effects/callbacks only)."

## What was done

Three hooks came out, each owning one thing:

- **`useDocumentViews.ts`** — the open documents: their text, the text the file
  last agreed with, the conflict flags, and the seven operations that move
  between them. Also the pruning a closed tab needs, all three kinds together.
  The pure decisions stay in `externalDocumentSync.ts`; this owns the state
  they transform.
- **`useExternalDocumentSync.ts`** — the subscription that keeps tabs level
  with files changed outside the app. Split from `useDocumentViews` for a
  concrete reason, not tidiness: it needs the workspace root, which only exists
  after the lifecycle hook has restored it, while the documents must exist
  *before* that because the lifecycle hook loads restored tabs through them.
  Two hooks is what lets each mount where its inputs are ready.
- **`usePanelResize.ts`** — pointer capture, the three window listeners, the
  saved `user-select`, and the teardown for all of it. That teardown used to
  live in the shell's unmount effect, a file away from the code installing it.

`PanelSide` moved to `shellTypes.ts`; it had been declared privately in two
files that have to agree about what "left" means.

## What was deliberately left alone

- **`handlePaletteCommand`** stays in the shell. It is a switch over ~12 shell
  callbacks, so extracting it would mean a hook with a twelve-function
  interface — strictly worse to read than the switch.
- **The JSX.** 164 of the remaining lines are the composition itself, which is
  what this file is supposed to be.

## Acceptance Criteria

- [x] `DesktopShell.tsx` is under 800 lines — 1,122 → **479**, of which 164 are
      the JSX composition.
- [x] No new behavior — the diff is 354 deletions against 48 insertions, and
      every insertion is an import or a hook call. All 1,323 desktop tests pass
      unchanged, no test edited.
- [x] Extracted modules are focused (one responsibility each).
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Found on the way

`eslint.config.js:71` registers the `react-hooks` plugin for `**/*.tsx` only,
so hooks written in `.ts` files get no hook linting at all — that now covers
`useWorkspaceLifecycle.ts`, `useSyncSurfaces.ts` and the three added here.
Stale dependency arrays in any of them would go unreported. Not fixed here:
widening it is a repo-wide lint change that will surface existing findings,
which is its own task rather than a rider on a refactor.

`useWorkspaceLifecycle.ts` is still 516 lines and could not be mounted in a
test when one was attempted (during the multi-window tab fix) — it pulls in
enough of the app that a unit test times out. It is the next candidate, and the
reason is coverage rather than length.

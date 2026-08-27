# Story: Hook Lint Reaches Hooks Written in `.ts`

**Status:** ✅ done · **Urgency:** medium · **Difficulty:** easy (mechanically) —
the risk is entirely in what it uncovers

## The gap

`eslint.config.js:71` registers the `react-hooks` plugin against `**/*.tsx`:

```js
{
  files: ["**/*.tsx"],
  plugins: { "react-hooks": reactHooks },
  ...
}
```

A custom hook containing no JSX is correctly named `.ts`. Every one of those is
therefore linted for nothing: not `rules-of-hooks`, not `exhaustive-deps`. A
stale dependency array in any of them is unreported, and so is a hook called
conditionally.

Already affected:

- `apps/desktop/src/shell/useWorkspaceLifecycle.ts`
- `apps/desktop/src/shell/useDocumentViews.ts`
- `apps/desktop/src/shell/useExternalDocumentSync.ts`
- `apps/desktop/src/shell/usePanelResize.ts`
- `apps/desktop/src/sync/useSyncSurfaces.ts`
- `apps/desktop/src/sync/syncNotificationAdapter.ts`,
  `settleNotificationAdapter.ts`, `conflictNotificationAdapter.ts`
- plus any `use*.ts` elsewhere in `apps/desktop` and `packages/ui`

## Why it matters more than a lint-config tidy

A stale dependency array is a bug that reads as correct code. The effect keeps
a closure over a value from an earlier render and quietly acts on it — the
class of defect where the app does something with data the user replaced ten
seconds ago. That is exactly the shape of the multi-window tab bug, which
persisted through review because nothing pointed at it.

The hooks listed above are not incidental: they own document contents, the
outside-change watcher, and workspace restoration. Those are the paths where
acting on a stale value costs someone their writing.

## How it was found

Writing `usePanelResize.ts`, an `eslint-disable-next-line
react-hooks/exhaustive-deps` directive carried over from `DesktopShell.tsx`
errored as **"Definition for rule 'react-hooks/exhaustive-deps' was not
found"** — the rule was not merely passing, it was not loaded.

## The work

1. Widen the plugin registration from `**/*.tsx` to `**/*.{ts,tsx}`. One line.
2. Run `pnpm lint` and read every new finding. **Expect a batch**, since these
   files have never been checked.
3. Treat each finding on its merits. There are two honest outcomes and they
   must not be confused:
   - the dependency is genuinely missing → **add it**, and check the effect
     does not now re-run more than intended;
   - the value is a stable ref or a reducer `dispatch` → **an explicit
     `eslint-disable-next-line` with the reason**, which is what the codebase
     already does in `.tsx`.
4. Nothing gets silenced in bulk. A blanket disable at the config level, or a
   file-level disable added to make the run pass, puts the gap straight back
   with a comment claiming it was considered.

## Acceptance

- [x] `react-hooks` rules run against `.ts` as well as `.tsx`
- [x] `pnpm lint` passes with every finding either fixed or individually
      disabled with a stated reason
- [x] No config-level or file-level blanket suppression of either rule
- [x] Any dependency actually added is checked for a behavior change — a newly
      complete deps array can turn a mount-once effect into one that re-runs;
      the full suite passing is necessary but not sufficient, so say in the PR
      which effects changed shape

## Notes for whoever picks this up

Good task for a smaller agent: the mechanical part is one line and the rest is
a bounded list of findings to work through one at a time. The judgment needed
per finding is local — "is this ref stable?" — and the answer is usually in the
comment already sitting above the deps array.

Watch for one trap: a few of these files carry the *reason* as a plain comment
(`// dispatchTabs is a stable reducer dispatch, so it stays out of the deps.`)
because the disable directive itself errored while the rule was unloaded. Once
the rule loads, those want to become real directives again.

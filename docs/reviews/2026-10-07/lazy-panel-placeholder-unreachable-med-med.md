# Lazy panel activation unmounts its own placeholder — "not registered" flashes instead of "Starting extension…"

- **Urgency:** med
- **Difficulty:** med
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/LazyExtensionPanel.tsx` (root cause in `bootstrap.ts` + `Popout.tsx`)
- **Lines:** LazyExtensionPanel.tsx 21–58; bootstrap.ts 113–134, 160–179; Popout.tsx 76–88

## Description

`LazyExtensionPanel` exists to render "Starting extension…" while a stub's
`ensureActive` resolves and the failure message when it rejects. But the
moment `ensureActive` runs, `bootstrap.ts:116` calls `disposeStubs(state)`,
which disposes the stub's panel registration. The registry notifies
subscribers synchronously (`contributions.ts` `changed()`), so
`useLeftPanelContributions`/`useRightPanelContributions` re-render the
popout, `contributions.find(c => c.id === panel)` fails, and `Popout.tsx:79–88`
renders `Panel '<ext>.<panel>' is not registered.` — unmounting the
LazyExtensionPanel mid-activation.

Consequences:

- The user never sees "Starting extension…"; they see a (possibly long,
  for disk-loaded extensions) "not registered" error state plus the
  activity-bar icon disappearing until activation completes.
- The `phase === "failed"` branch (lines 39–47) is dead code in production:
  on activation failure the stubs stay disposed (deliberately, per the
  comment at bootstrap.ts:111–112), so the panel slot shows "not
  registered", never the designed failure message. The same applies to the
  missing-contribution gap noted in
  `declared-contribution-missing-after-activation-low-easy.md`.
- The shell keeps the stale `leftPanel`/`rightPanel` selection, and
  `isSelectableLeftPanel`/`isSelectableRightPanel` (`shellTypes.ts`) check
  the live registry, so a `revealPanel`-style command aimed at the panel
  during the activation gap is silently dropped.

## Recommendation

Keep something registered under the panel id for the whole activation
window so the placeholder survives. Options:

- Give the registry/host a "replace" path so the real panel can swap the
  stub atomically instead of dispose-then-register (e.g. the extension's
  `context.panels.register` disposes the matching stub itself at register
  time, which also removes the ordering constraint).
- Or register panel stubs in a separate holding list that Popout consults
  before falling back to "not registered".

Whichever approach, the failure UI in `LazyExtensionPanel` then becomes
reachable and the icon/popout stay stable through activation.

## Verification

Read `bootstrap.ts:113–134` (`disposeStubs` precedes `host.activate`) and
`contributions.ts:95–108` (dispose notifies listeners). `Popout.tsx:76–88`
renders `Panel '…' is not registered.` whenever the active id is absent
from `contributions`. The pending/failed branches at
`LazyExtensionPanel.tsx:39–55` therefore cannot be observed in the real
app — only in isolation.

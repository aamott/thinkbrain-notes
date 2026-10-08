# An extension that activates without re-registering a declared contribution fails silently

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/bootstrap.ts`
- **Lines:** 159–163 (command stub handler), 182 (panel stub `resolve`)

## Description

Stubs are disposed before activation and the extension is expected to
re-register each declared contribution under the same prefixed id. If
activation succeeds but the extension never re-registers one:

- **Command:** the stub handler does `commands.get(fullId)` and, when absent,
  silently does nothing (`if (real)` at line 162). The contribution vanishes
  from the palette with no diagnostic.
- **Panel:** `resolve` returns `panels.get(fullId)?.factory(...) ?? null`
  (line 182), so `LazyExtensionPanel` transitions to "ready" and renders an
  empty panel — no error state, no console message. The panel also disappears
  from the activity bar on the next registry refresh, so the user just sees
  nothing happen.

This is a realistic authoring mistake (a declared panel the extension forgot,
or a registration that threw partway through `activate` while the host still
marks it active — `activate` returning cleanly with a partially-fulfilled
manifest is possible). The load path already has a diagnostics channel for
exactly this class of problem (`panels_not_supported` and friends ride on
`BootstrapEntry.reasons`); a runtime gap check could reuse it or at least
`console.error`.

## Recommendation

In the stub handler/`resolve`, log or surface a diagnostic when `get(fullId)`
returns `undefined` after successful activation — e.g.
`console.error("[extensions] <id> activated but never registered contribution
<fullId>.")` — and for panels consider rendering the same failure block
`LazyExtensionPanel` already shows for failed activation instead of `null`.

## Verification

Read bootstrap.ts:155–187: stubs are disposed at line 124 (`disposeStubs`)
before `host.activate`; the command handler at 159–163 swallows a missing real
command, and `resolve` at 182 maps a missing panel to `null`.
LazyExtensionPanel.tsx:55–57 renders whatever `resolve` returns with no
missing-contribution branch.

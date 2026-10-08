# `app.rebuildIndex` command's only effect is pinning an always-unavailable terminal panel

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/useShellCommands.ts`
- **Lines:** 61, 116–118 (with `BottomPanel.tsx:28–38`, `DesktopShell.tsx:89–103`)

## Description

The command palette offers **"Terminal · Rebuild workspace index"**
(`commandRegistry.ts` via `useShellCommands:61`), always `available`. Its
handler does exactly one thing:

```ts
context.effects.toggleBottomPanel("terminal");
```

The `terminal` surface it opens is registered with
`isAvailable: () => false` ("Terminal is external... surfaced in a later
update" — `BottomPanel.tsx:38`), so `BottomPanel`'s render guard
`surfaces.get(surface)?.isAvailable(...) ?? true` collapses the dock to
`hidden` and `DesktopShell`'s `bottomActive` check (line 89) suppresses the
entire region.

Net effect: the command claims to rebuild the workspace index, never
touches the index (`useWorkspaceIndexes`' `WorkspaceIndexesApi` has no
rebuild/export for it to call), and presents a bottom dock whose only tab
renders nothing. If the user pinned `surface: "terminal"` the last
selection even reroutes to `"search"` on mount — the feedback is a flash of
a dock that instantly hides itself.

The command is wired and reachable — it just has no working destination.

## Recommendation

Either drop the registration until the terminal surface exists (its own
comment says the terminal is deferred), or point the command at a real
effect — e.g. a `terminal.rebuildIndex`/`native.rebuildIndex` command in
`native/commands.ts`, or reuse the sync/index infrastructure that
`IndexerPanel` and `useWorkspaceIndexes` already drive. If the command
survives as an opener, at least stop it from pinning a panel that can never
render.

## Verification

Command palette → "Rebuild workspace index" → nothing appears. `grep -n
"rebuildIndex" apps/desktop/src` reaches only this command and
`useWorkspaceIndexes`' unrelated `sweep`/`ingest`. `BottomPanel.tsx:38` is
`isAvailable: () => false`; `DesktopShell.tsx:89` treats unavailable as
collapsed.

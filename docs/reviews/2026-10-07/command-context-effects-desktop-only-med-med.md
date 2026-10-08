# Command-context effects are bound to desktop dock state the phone chrome never reads

- **Urgency:** med
- **Difficulty:** med
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/useShellCommands.ts`
- **Lines:** 86–124 (consumed by `PhoneShell.tsx:166–182` via `shell.runCommand`)

## Description

`runCommand` is built once in `useShellCommands` and shared by both chromes
(`useShellState.ts:171–183`), but its `DesktopCommandContext` effects are
wired straight to desktop dock setters:

- `revealPanel` → `setRightPanel` — `PhoneShell` explicitly never reads
  `shell.rightPanel`; the inspector is a navigation overlay
  (`overlay.kind === "inspector"`), so an extension command that reveals a
  right panel mutates state nothing renders.
- `revealLeftPanel`, `toggleExplorer`, `openSearch`, `showExplorer` →
  `setLeftPanel`/`selectLeftPanel` — on phone, `leftPanel` is *derived
  from the route* (`usePhoneRouteSync.ts:60–66` overwrites it on every
  route change) and only feeds the drawer's highlight, so these are dead
  writes plus a stray `persistDesktopState({ explorerOpen })` a phone action
  had no business writing.
- `toggleOutline`/`toggleAssistant`/`toggleBottomPanel` — same story:
  outline/assistant go to the dead `rightPanel`; the bottom panel does at
  least render via `BottomSheet`.

So an extension command works differently — or not at all — depending on
which chrome happens to be running, and there is no way for an extension
command to express "show my panel" on mobile even though the phone has a
perfectly good inspector surface for it (`navigation.pushOverlay({ kind:
"inspector", panel })`). Today only `mobileNewNoteActions` reach command
handlers on phone (none reveal panels), so it is latent — but the platform
sells `engines.platform: ["desktop", "mobile"]` on commands whose panel
effects silently no-op on one of them.

## Recommendation

Route the panel-affecting context actions through a per-chrome intent
layer: `useShellState` could expose abstract intents (`revealPanel(panelId)`,
`showExplorer()`) that `DesktopShell` maps to dock setters and `PhoneShell`
maps to `navigation.push/pushOverlay`. Short of that, have `runCommand`
narrow `revealPanel`/`revealLeftPanel` by side and let the phone
implementation translate left reveals into `{ kind: "panel" }` routes and
right reveals into inspector overlays — the pieces already exist in
`usePhoneOpeners` (`showVersions` pushes an inspector overlay).

## Verification

On phone chrome, run a command that calls `revealPanel` (e.g. a New-note
action wired to `note-stats.show`): `setRightPanel` updates state and
`PhoneShell` reads `overlay.panel`, never `shell.rightPanel`
(`PhoneShell.tsx:74–84`). `usePhoneRouteSync.ts:60–66` shows `leftPanel`
being set *from* the route, not the reverse.

# Persisted extension settings are invisible until the schema registers *and* settings reload

- **Urgency:** med
- **Difficulty:** med
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/settingsStore.ts`
- **Lines:** 217–254 (`loadSettings`), with `packages/core/src/settings/dynamic.ts:271–288` (`extractScopedValues`)

## Description

`loadSettings` parses the settings document through
`extractScopedValues`, which only copies keys whose definition is **already
registered** in `appSettingsRegistry` (`dynamic.ts:278–286`). Unknown keys —
including every `extension-<id>.*` key whose extension has not activated —
are dropped from `appValues`/`workspaceValues` (they survive on disk only
because `serializeDynamicSettings` preserves unknown keys in the document).

But extension schemas register inside `activate`, and both built-ins are
lazy (`activationEvents` with no `onStartup` — `journal.tsx:46–51`,
`noteStats.ts:47`). Nothing re-runs `loadSettings` when a schema registers:
`registerSchema` only calls `appSettingsRegistry.register`
(`desktopExtensionHost.ts:295–299`), and the workspace lifecycle reload is
guarded by `workspaceRootPath === restoredWorkspacePath`
(`useWorkspaceLifecycle.ts:233–238`).

So in a session where the user never opens the Settings tab:

1. `ThemeProvider`/`useWorkspaceLifecycle` run `loadSettings` before journal
   ever activates → `extension-journal-calendar.root` is dropped.
2. User opens the Journal panel → `activateJournal` registers the schema →
   `journalRoot()` calls `context.settings.get("root")` →
   `effectiveSettingValue` misses staged/app/workspace layers and returns
   the *default* `"journal"`, not the persisted folder.
3. The journal then reads from — and `new-entry`/`today` **create files
   into** — the default folder, ignoring the user's configured root for the
   rest of the session.

`useNoteTitle.ts:19–21` has the same miss reading
`extension-journal-calendar.root` directly, so the title row also follows
the wrong root. `SettingsTab`'s `void getExtensionBootstrap()?.activateAll()`
(line 60) is un-awaited relative to the `loadSettings` effect, so even
Settings itself is racing rather than guaranteed.

## Recommendation

Re-extract persisted values when the registry gains modules — e.g. after
`registerSchema`, re-run `extractScopedValues` over the last-read documents
(or make `loadSettings` cheap enough to re-call on schema registration from
a registry `subscribe` — see the companion finding on the registry having
no subscribe API). Persisting the raw documents in the store at load time
would also let a re-extraction run without a disk round-trip.

## Verification

Write `extension-journal-calendar.root` to a workspace settings file, cold
start, and open the Journal panel without opening Settings:
`context.settings.get("root")` returns `"journal"` instead of the stored
value. `extractScopedValues` (`dynamic.ts:278–286`) iterates
`registry.getAllDefinitions()` only; `settingsStore.ts:217–254` calls it
once per load and nothing re-invokes it on registration.

# Persisted extension tab kinds are silently dropped at session restore

- **Urgency:** med
- **Difficulty:** med
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/useWorkspaceLifecycle.ts`
- **Lines:** 99–114, 309–321

## Description

`restoreTab` validates a persisted static tab's `kind` against the live
registry before recreating it:

```ts
if (desktopTabRegistry.get(persisted.kind) === undefined) return null;
```

Extension tab kinds only exist in the registry while the extension is
active — `context.tabs.register` runs inside `activate`, and the stub
system in `bootstrap.ts` (`registerStubs`, lines 143–180) covers
`contributes.commands` and `contributes.panels` only. There is no
`contributes.tabs` in the manifest schema
(`packages/core/src/extensions/manifest.ts:30–33`), so no pre-activation
stub for a tab kind can exist.

Result: a `journal-calendar.calendar` tab left open across a restart is
silently skipped at restore because `journal-calendar` activates lazily —
the `journal.calendar` kind is registered only when something else first
touches the extension. The comment at line 306 even names the intent —
"Static tabs (settings, calendar, etc.) are restored by kind alone" — but
for an extension kind that is exactly what does not happen. The user loses
a restored surface with no message; the entry is also dropped from the
persisted list on the next debounced save.

The same convention (`${extensionId}.${kind}`) that makes the tab
recognizable as extension-owned is the information needed to fix it.

## Recommendation

When `restoreTab` meets an unknown kind containing a dot, treat it as an
extension contribution and activate the owning extension before deciding —
e.g. `getExtensionBootstrap()` exposes the manifest map already, so the
restore effect could `ensureActive`-style activate the prefix owner and
re-queue the tab, or register a lazy tab stub (a `LazyExtensionPanel`-like
view) that activates on first render, mirroring how panel stubs resolve.
Alternatively add `contributes.tabs` to the manifest so stub registration
covers kinds the same way it covers commands and panels.

## Verification

Persist a workspace with `journal-calendar.calendar` in `openTabs`, restart
without activating the journal, and watch `restoring.openTabs` — the
calendar tab is missing. `useWorkspaceLifecycle.ts:319` returns `null`;
`bootstrap.ts:143–180` registers stubs for commands/panels only; the
manifest type (`manifest.ts:30–33`) has no tab contribution field.

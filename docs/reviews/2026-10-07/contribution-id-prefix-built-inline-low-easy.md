# The `extensionId.relativeId` convention is constructed by hand in five places and parsed ad hoc elsewhere

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/bootstrap.ts`
- **Lines:** 145, 161, 196–197 (also `desktopExtensionHost.ts:173–176, 197–199`, `SettingsNav.tsx:207`)

## Description

The qualified-id convention has a canonical constructor —
`prefixId(extensionId, kind, id)` in `desktopExtensionHost.ts:173` — but the
bootstrap stub path, which must produce the *same* strings so the real
registration replaces the stub, re-builds them inline:

```ts
const fullId = `${state.manifest.id}.${command.id}`;   // line 145
const fullId = `${state.manifest.id}.${panel.id}`;     // line 161
id: `${state.manifest.id}.${action.id}`,               // line 196
commandId: `${state.manifest.id}.${action.commandId}`, // line 197
```

A second convention — the settings module id `extension-${extensionId}` —
is likewise local to `settingsModuleId` (`desktopExtensionHost.ts:197`),
while shell code hardcodes the expansion
(`useNoteTitle.ts:8`, `"extension-journal-calendar.root"`).

On the parse side, `SettingsNav.buildSectionPath` derives a module id with
`definition.key.slice(0, definition.key.indexOf("."))` (line 207) even
though core exports `getModuleIdFromKey` for exactly this
(`packages/core/src/settings/registry.ts:453`, re-exported through the
barrel). Any future change to the separator or the need to split an id back
into `(extensionId, localId)` — which the tab-restore gap needs — currently
has no shared helper to call.

The convention is load-bearing: stub and real contribution must agree
byte-for-byte or `commands.get(fullId)` in the stub handler misses and the
duplicate-registration guard rejects the real one instead.

## Recommendation

Export `qualifyContributionId(extensionId, localId)` (and, if restore or
lookup needs it, `splitContributionId`) from `@thinkbrain/core` or the host
module, use it in `prefixId` and all four bootstrap sites, and have
`SettingsNav` import `getModuleIdFromKey` instead of slicing. Re-export the
`extension-${id}` settings-module helper so `useNoteTitle` does not
hand-concatenate it.

## Verification

`grep -n '\.id}\.' apps/desktop/src/extensions/bootstrap.ts` shows the four
inline constructions; `desktopExtensionHost.ts:173–176` is the canonical
one they must match. `SettingsNav.tsx:207` vs `registry.ts:453` are two
implementations of the same slice.

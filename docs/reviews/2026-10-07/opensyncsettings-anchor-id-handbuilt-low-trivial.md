# `openSyncSettings` rebuilds the settings anchor id by hand instead of using `sectionAnchorId`

- **Urgency:** low
- **Difficulty:** trivial
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/useSyncActions.ts`
- **Lines:** 150–165

## Description

`openSyncSettings` scrolls to the sync destination section with:

```ts
document.getElementById(`settings-section-${sectionId}`)
```

The `settings-section-` prefix is an internal detail of
`settings/sectionUtils.ts` (`SECTION_ANCHOR_PREFIX`, line 9), which exports
`sectionAnchorId(qualifiedId)` for exactly this purpose — and every other
consumer uses it: `SettingsNav.tsx:42` for its own scroll,
`SettingsContent.tsx:233–240` for the rendered `id`/`aria-labelledby`
pair, and the scroll-spy test utils. `useSyncActions` is the one caller in
`shell/` that reconstructs the contract by string concatenation; if the
prefix ever changes, this scroll silently stops landing (the
`getElementById` is optional-chained, so nothing would even warn).

It is the same class of drift risk as the scattered `${ext}.${id}`
constructions — a cross-module DOM contract re-encoded as a literal.

## Recommendation

Import `sectionAnchorId` from `../settings/sectionUtils` and call
`sectionAnchorId(sectionId)`. Alternatively (and better), let the settings
tab own the scroll: `setActiveSection` + a settings-side effect keyed on
`activeSection` already exists for nav clicks, so the rAF-pair hack here
could go away entirely.

## Verification

`sectionUtils.ts:9,39` owns the prefix and the helper;
`useSyncActions.ts:159` is the only non-test
`` `settings-section-${…}` `` construction outside it. Rename
`SECTION_ANCHOR_PREFIX` and `openSyncSettings` scrolls nowhere while nav
clicks keep working.

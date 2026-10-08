# Invalid `root` setting throws inside `applies` and crashes every open editor tab

- **Urgency:** med
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/builtins/journal.tsx`
- **Lines:** 90–91, 116–123

## Description

`journalRoot()` calls `normalizeRoot(context.settings.get("root") ??
DEFAULT_ROOT)` with no guard. `normalizeRoot` throws for an empty/blank root and
for one containing `..`. The `root` setting is typed `"path"`, which only
checks that the value is a string (or null) — `".."` or `" "` pass validation
(`packages/core/src/settings/validation.ts:103–114`), and workspace settings can
also be hand-edited on disk.

`journalRoot()` is called from `belongsHere`, which is the `applies` callback of
the `metadata-widget` editor-header contribution. `EditorHeaderSlot`
(`apps/desktop/src/tabs/editorHeaderRegistry.tsx:27–30`) invokes `applies`
inside `useMemo` during render for **every** Markdown editor. So a bad `root`
value turns editing any note into a `TabBoundary` crash ("This tab stopped
working"), while the journal service itself degrades gracefully — `requireRoot`
in `journalService.ts:104–119` catches the same condition and returns the
approved `invalid-root` `JournalError`.

Same pattern cross-scope (not this file): `shell/useNoteTitle.ts:20` calls
`normalizeRoot` inside a settings-store selector, so an invalid root also
crashes title-row rendering.

## Recommendation

Make the render path tolerant, matching the service's posture:

```ts
const safeJournalRoot = (): string | null => {
  try {
    return journalRoot();
  } catch {
    return null;
  }
};
```

and in `belongsHere`, treat a `null` root as "not under the journal folder"
while still honoring the configured-fields check. `searchEntries`/`loadFacets`/
`matchEntries` call `journalRoot()` inside async callbacks where a throw becomes
a promise rejection the panel already handles, so `belongsHere` is the only
render-time hazard. Consider the same try/catch in `useNoteTitle.ts`.

## Verification

Set `extension-journal-calendar.root` to `".."` (or stage it via the settings
store) and open any Markdown note: `belongsHere` → `journalRoot()` →
`normalizeRoot` throws inside `EditorHeaderSlot`'s `useMemo`, caught only by
`TabBoundary`. `journalService.ts:115` shows the graceful handling the render
path lacks.

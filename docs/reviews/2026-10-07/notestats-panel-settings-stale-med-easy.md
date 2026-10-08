# Note Stats panel reads its settings once per render — changes go stale

- **Urgency:** med
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/builtins/noteStats.tsx`
- **Lines:** 55–83

## Description

The panel factory reads `wordsPerMinute` and `showReadingTime` with
`context.settings.get` at render time (lines 67–68). Nothing re-renders a
mounted panel when a setting changes — the factory only re-runs when the
panel's context props (`documentContents`, `rootPath`, …) change. So toggling
"Show reading time" or editing "Reading speed" in Settings leaves the open
panel showing the old values until some unrelated state change re-renders it.

The journal built-in documents this exact trap (`journal.tsx:126–138`) and
solves it with a `useWatchedSetting` hook built on
`context.settings.onDidChange` + `useSyncExternalStore`. Note Stats — the
extension whose job is to model the API for third parties — demonstrates the
stale pattern instead.

## Recommendation

Return a real component from the factory (the way `journal.tsx` returns
`<JournalPanelRoot />` rather than inline JSX — panel factories are invoked as
plain function calls inside `MountedPanel`, so hooks belong inside a child
component) and subscribe to both keys:

```tsx
function StatsPanel({ contents }: { readonly contents: string | null }) {
  const wordsPerMinute = useSyncExternalStore(
    (onChange) => {
      const sub = context.settings.onDidChange("wordsPerMinute", onChange);
      return () => sub.dispose();
    },
    () => context.settings.get<number>("wordsPerMinute") ?? FALLBACK_WPM
  );
  // …same for showReadingTime…
}
```

The two subscriptions can share one helper; `useWatchedSetting` in
`journal.tsx` is the local precedent if a shared utility is extracted.

## Verification

Open a note, reveal the Note Stats panel, then toggle
`extension-note-stats.showReadingTime` in Settings. The "Reading time" row
stays as it was until the panel re-renders for another reason (e.g. switching
notes). The journal's `fieldDefinitions` subscription
(`journal.tsx`, `useWatchedSetting`) shows the intended reactive pattern.

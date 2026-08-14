- name: noteStats panel computes stats before the null-document check and does not react to settings changes
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/builtins/noteStats.tsx
- lines: 55-82
- description: |
    Two issues in the Note Stats panel factory:

    1. **Wasted computation** (lines 56-68): `computeNoteStats` is called on
       line 58 with `panelContext.documentContents` **before** the
       `documentContents === null` early return on line 60. When no note is
       open, the stats are computed (treating `null` as `""`) and immediately
       discarded. The null check should move above the computation:
       ```tsx
       factory: (panelContext: DesktopPanelContext) => {
         if (panelContext.documentContents === null) {
           return (<div className="p-4"><p ...>Open a Markdown note...</p></div>);
         }
         const wordsPerMinute = context.settings.get<number>("wordsPerMinute") ?? FALLBACK_WPM;
         const showReadingTime = context.settings.get<boolean>("showReadingTime") ?? true;
         const stats = computeNoteStats(panelContext.documentContents, wordsPerMinute);
         return (...);
       }
       ```

    2. **Non-reactive settings reads** (lines 56-57): `wordsPerMinute` and
       `showReadingTime` are read once per render but the panel does not
       subscribe to settings changes. If the user edits "Reading speed" or
       "Show reading time" in Settings while the panel is open, the panel keeps
       showing the old values until a note switch forces a re-render. The
       journal built-in solves this with `useWatchedSetting` (a
       `useSyncExternalStore` wrapper around `context.settings.onDidChange`).
       noteStats could adopt the same pattern, or the panel factory could be
       converted to a component that subscribes.
- verification: |
    Read lines 55-82. Confirmed the call order: `computeNoteStats` (line 58)
    precedes the `=== null` guard (line 60). `computeNoteStats` (noteStats.ts
    line 28-39) handles `null` by coercing to `""`, so this is wasted work, not
    a crash. Cross-checked `journal.tsx` lines 167-178 (`useWatchedSetting`)
    which noteStats does not use.

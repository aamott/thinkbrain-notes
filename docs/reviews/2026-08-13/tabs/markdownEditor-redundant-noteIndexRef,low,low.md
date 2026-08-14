- name: Redundant noteIndexRef assignment in reconfigure effect
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/MarkdownEditor.tsx
- lines: 114, 196
- description: `noteIndexRef.current = noteIndex` is set in two separate effects that both list `noteIndex` in their dependency arrays:

  - Line 114 (ref-sync effect, deps `[onChange, onSave, resolveAssetUrl, noteIndex, onOpenNote]`)
  - Line 196 (reconfigure effect, deps `[livePreview, noteIndex, livePreviewCompartment, wikiLinkAutocompleteCompartment]`)

  When `noteIndex` changes, both effects run, and `noteIndexRef.current` is assigned the same value twice. The line 196 assignment is redundant — the ref-sync effect at line 114 already keeps it current.

  Note: `livePreviewRef.current = livePreview` at line 195 is NOT redundant — `livePreview` is not in the ref-sync effect's deps, so the reconfigure effect is the only place that keeps `livePreviewRef` current.

  Fix: remove line 196 (`noteIndexRef.current = noteIndex;`).

- verification: Read `MarkdownEditor.tsx` lines 110-116 and 194-215. Both effects include `noteIndex` in their dep arrays. Grepped `noteIndexRef` confirming 3 matches (declaration, line 114, line 196).
- savings: 1 line.

- name: Autocomplete extension closes over a snapshot `noteIndex` and must be reconfigured on every index change
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/wikiLinkAutocomplete.ts
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/markdownEditorHooks.ts
- lines: 99-119 (autocomplete), 101-109 (hook wiring)
- description: `wikiLinkCompletionSource(notes)` (lines 99-119) closes over the `notes` array passed at construction time. `wikiLinkAutocomplete(noteIndex)` (lines 135-142) likewise bakes the array into the returned `Extension`. The docstring at lines 122-134 acknowledges this ("a fresh extension instance is all that is needed when the vault index changes") and `markdownEditorHooks.ts` lines 101-109 wires it through a `wikiLinkAutocompleteCompartment` so the editor can reconfigure.

  The risk is that *consumers must know* to reconfigure the compartment whenever `noteIndex` changes. `DesktopShell.tsx` line 99 selects `noteIndex` from the store and passes it down to `MarkdownEditor`, which must thread it into the compartment reconfigure call. If any consumer forgets to reconfigure (e.g. an extension host that builds its own editor), the autocomplete popup will show stale notes — a newly created note won't appear, a deleted note still will. There is no runtime guard or warning for this.

  A secondary issue: `wikiLinkAutocomplete([])` returns `[]` (line 136), so when the index is empty (no workspace) the compartment holds an empty extension. When the workspace opens and `noteIndex` populates, the compartment must be reconfigured *from* `[]` *to* the real extension. If the reconfigure is missed, autocomplete silently never appears — no error, just nothing. This is the "fail silently" anti-pattern the project rules say to avoid.

- verification: Read `wikiLinkAutocomplete.ts` lines 99-142 (closure over `notes`, no internal subscription) and `markdownEditorHooks.ts` lines 101-109 (compartment wiring). Confirmed there is no internal `useWikiLinkIndexStore` subscription inside the autocomplete module — it relies entirely on the caller to pass a fresh `noteIndex`.

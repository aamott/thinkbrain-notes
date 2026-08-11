- name: noteIndex and onOpenNote are drilled through four component layers
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/DesktopShell.tsx
- lines: 99, 400-406, 718
- description: |
    The wiki-link note index and open callback traverse
    `DesktopShell` → `TabContent` → `MarkdownEditor` → `markdownEditorHooks`
    payload → `livePreview`/`wikiLinkAutocomplete` options. That is four hops,
    each adding a prop to a public interface (`TabContentProps`,
    `MarkdownEditorProps`, `MarkdownEditorHookPayload`, `LivePreviewOptions`).

    For two props this is acceptable and explicit, and the type signatures
    document the dependency clearly. The drilling becomes a smell if more
    vault-scoped values are added later (e.g. a backlink index, tag index,
    vault root for new-note creation). At that point a single
    `VaultEditorContext` provided near `DesktopShell` and consumed inside
    `MarkdownEditor` (or directly inside the hook registry) would flatten the
    chain and stop every intermediate component from re-declaring the props.

    No change required now; flagged as a design watchpoint. If/when a third
    vault-scoped value is needed, introduce the context and migrate
    `noteIndex`/`onOpenNote` to it in the same change.
- verification: |
    `DesktopShell.tsx` line 99 reads `noteIndex` from the store and line 718
    passes `noteIndex={noteIndex} onOpenNote={onOpenNote}` to `<TabContent>`.
    `TabContent.tsx` lines 20-21 declare both on `TabContentProps` and lines
    143-144 forward them to `<MarkdownEditor>`. `MarkdownEditor.tsx` lines
    28-30 declare them on `MarkdownEditorProps` and lines 131, 198 pass them
    into the livePreview extension. `markdownEditorHooks.ts` lines 41-43
    declare them on `MarkdownEditorHookPayload`.

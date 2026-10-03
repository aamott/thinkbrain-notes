- name: Header Save shows no in-flight feedback for merge resolutions
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/WorkspaceHeaderBar.tsx
- lines: 118-141; MergeTab.tsx 229-235
- description: |
  Cross-file interaction from the command-registry refactor: the header's
  "Saving…" state is driven by `isSaving`, the shell's document-save flag.
  A merge tab's Save goes through `commands.save` → `resolveConflict`, which
  sets `resolving` in MergeTab — so during the (potentially slow, native)
  resolve the button only goes disabled via `canSave() === false`; it never
  shows "Saving…" and the label stays "Save merged note". Options: let
  `EditorCommands` expose a `saving`/`pending` flag the header prefers over
  `isSaving`, or accept it and document that disabled-is-the-indicator.
- verification: Read WorkspaceHeaderBar render path and MergeTab's canSave;
  `isSaving` is only ever the caller's document-save prop, never set by a
  merge resolve.

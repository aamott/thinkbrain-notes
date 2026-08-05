- name: saveSettings partial-failure leaves store inconsistent with disk
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/settingsStore.ts
- lines: 361-409
- description: |
    `saveSettings` writes app settings first (lines 374-383) then workspace settings (lines 385-394) in sequence. If the app write succeeds but the workspace write throws, the catch block (404-409) sets `saveError` and returns `{ success: false, diagnostics: [] }` — but the app-side `set({ appValues: merged, rawAppSettingsJson: serialized })` at line 382 has ALREADY committed the new app values into store state, and `stagedChanges` is NOT cleared (the clearing `set` at 396-402 only runs on full success).

    Resulting inconsistent state:
      - Disk: app settings written (new values persisted), workspace settings NOT written (old values on disk).
      - Store: `appValues` reflects the new app values (matches disk — good), `workspaceValues` still reflects staged merge? No — `workspaceValues` is NOT updated (the workspace `set` at 393 never ran), so `workspaceValues` still holds the OLD workspace values while `stagedChanges` still holds the workspace staged change. The user sees the staged workspace change still pending (dirty), but the app change is gone from staged and committed.
      - On the next Save attempt, only the workspace staged change remains and will be retried; the app change won't be re-attempted (correct, since it's on disk). But `saveError` is set and the user may believe NOTHING was saved.

    The error message "Failed to save settings: <workspace error>" is misleading because the app portion DID save. The user might retry or abandon, not knowing the app half succeeded.

    Also: the catch returns `diagnostics: []` even though the failure was an I/O error, not a validation error — callers checking `result.diagnostics` for emptiness may misinterpret.

    Recommended fix: track which scope(s) wrote successfully and report partial success; only set `saveError` for the failed scope; clear the staged changes for scopes that did persist; consider a transactional note in the error message ("App settings saved, but workspace settings failed: ...").

- verification: |
    Read settingsStore.ts:374-394 — app write + set at 382 happens before workspace write at 392; no rollback on workspace failure.
    Read settingsStore.ts:396-402 — stagedChanges clear only runs after both writes succeed.
    Read settingsStore.ts:404-409 — catch sets saveError and returns success:false with empty diagnostics regardless of which write failed.

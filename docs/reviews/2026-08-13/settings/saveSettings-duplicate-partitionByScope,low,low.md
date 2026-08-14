- name: saveSettings calls partitionByScope twice on the same staged map
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/settingsStore.ts
- lines: 422, 439
- description: |
    In `saveSettings`, `partitionByScope(appSettingsRegistry, staged)` is
    called twice on the same `staged` object:
      - Line 422: destructured as `{ app: appStagedApp, workspace: appStagedWorkspace }`
        and used to build the validation map.
      - Line 439: destructured as `{ app: appStaged, workspace: workspaceStaged }`
        and used to drive the gateway writes.

    Both calls produce identical partitions (same registry, same input). The
    first result is used only to merge staged into the effective validation
    map (lines 423-424); the second is used to decide which scopes to write
    (lines 457-462) and to compute the persisted-key set (lines 495-498).

    Compute the partition once and reuse it for both validation and writing.
    The two destructuring names differ (`appStagedApp` vs `appStaged`) but
    refer to the same data — a single `{ app: appStaged, workspace: workspaceStaged }`
    result covers both call sites.

    Estimated savings: ~3 lines and one redundant registry scan over all
    definitions (the `scopeOfKey` lookup per key).
- verification: |
    Read settingsStore.ts lines 412-440: the two `partitionByScope` calls are
    17 lines apart on the same `staged` variable with no mutation in between.
    `partitionByScope` (lines 254-268) iterates all entries and calls
    `registry.getDefinition(key)?.scope` per key — not free when the staged
    map is large.

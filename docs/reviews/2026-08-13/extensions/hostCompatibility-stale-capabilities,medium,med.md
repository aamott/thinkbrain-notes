- name: HOST_COMPATIBILITY capabilities list is stale relative to the actual extension context
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/hostCompatibility.ts
- lines: 18-22
- description: |
    `HOST_COMPATIBILITY.capabilities` declares only
    `["commands", "panels", "editorHooks", "settings"]`, but
    `DesktopExtensionContext` (desktopExtensionHost.ts lines 148-159) exposes
    six more surfaces: `editorHeaders`, `tabs`, `events`, `workspace` (plus the
    already-listed four). `evaluateCompatibility` (compatibility.ts lines 122-130)
    emits a **warning** for every capability an extension declares that the host
    does not advertise. So an extension that declares `capabilities:
    ["editorHeaders"]` (or `tabs`, `events`, `workspace`) loads with a spurious
    "Capability X is unavailable on this host" warning in the Extensions panel,
    even though the host fully supports it.

    The capabilities list should be:
    ```ts
    capabilities: ["commands", "panels", "editorHooks", "editorHeaders", "tabs", "events", "workspace", "settings"]
    ```
- verification: |
    Read `hostCompatibility.ts` (capabilities array) and
    `desktopExtensionHost.ts` lines 148-159 (`DesktopExtensionContext`
    interface). Cross-checked `evaluateCompatibility` in
    `packages/core/src/extensions/compatibility.ts` lines 122-130: any declared
    capability not in the host's list produces a warning reason. The journal and
    note-stats built-ins declare `capabilities: []` so they are unaffected today,
    but any third-party extension declaring the newer surfaces gets a false
    warning.

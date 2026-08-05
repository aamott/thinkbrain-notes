- name: Export flattens `var()` token references to resolved values (non-round-tripping)
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/themeImportExport.ts
- lines: 62-75, 108-135
- description: |
    `readCurrentTokenValues()` (lines 62-75) reads each known token via
    `getComputedStyle(root).getPropertyValue(token)`. `getComputedStyle` returns the
    *used* (resolved) value, so if a token is authored as
    `--tn-color-primary: var(--tn-accent)` (or `color-mix(...)`, `oklch(...)`, etc.),
    the exported `.tbtheme.json` captures the final resolved color string, not the
    authoring-time expression. The module docstring (lines 13-17, 116-118) calls this
    intentional ("captures exactly what the user sees") and frames export as a
    "snapshot current state" action — which is a legitimate use case.

    The concern is that this is not surfaced to the user. A user who exports a
    custom theme expecting to edit and re-import it loses the indirection structure
    (token aliases, `color-mix` formulas) on every export round-trip. There is no
    warning in the UI or in the export status message, and the `ThemeToolbar`
    "Export Theme" button gives no hint that the output is a flattened snapshot
    rather than a faithful copy of the source file. For users who imported a
    hand-authored theme and then export it, the result is a subtly different file.

    This is not a code bug — the behavior is documented in the module — but it is a
    missing edge case from a UX/expectations standpoint. Options:
    - If a `appearance.themeFile` is currently active, offer to export the *source
      file bytes* directly (round-trip-safe) instead of recomputing from computed
      styles, and only fall back to the computed-style snapshot when no custom theme
      is active.
    - Or, at minimum, change the export status message / button tooltip to indicate
      the output is a resolved snapshot, so users don't expect byte-for-byte
      round-tripping.

    Marked low urgency because the behavior is intentional and documented; the fix
    is a UX refinement rather than a correctness repair.
- verification: |
    Read `readCurrentTokenValues` (62-75): uses `getComputedStyle` which returns
    resolved values per CSSOM spec. Read `buildThemeExportPayload` (123-135): feeds
    those resolved values straight into `serializeThemeFile`. Read the module
    docstring (13-17, 108-118): explicitly frames export as a "snapshot" of
    effective state, confirming the behavior is by design but noting it is a
    snapshot, not a source-preserving copy. No UI text in `ThemeToolbar`
    (SettingsContent.tsx 229-256) warns the user about flattening.

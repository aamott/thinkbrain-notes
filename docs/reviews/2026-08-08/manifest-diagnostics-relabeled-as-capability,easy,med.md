- name: Manifest diagnostics relabeled as `capability` reasons, losing semantic code
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/bootstrap.ts
- lines: 183-188, 271-275
- description: |
    When a built-in manifest fails to parse, the diagnostics are mapped into
    `BootstrapEntry.reasons` with a hardcoded `code: "capability"` (lines
    183-188). The same relabeling happens for load diagnostics on a
    successfully-loaded local extension (lines 271-275).

    `ManifestDiagnostic.code` carries specific values like
    `manifest_missing_field`, `manifest_invalid_id`, `entry_absolute_path`,
    `manifest_invalid_json`, etc. — produced by `parseExtensionManifest` and
    the loader. `CompatibilityReason.code` is a closed union of
    `"api-version" | "platform" | "capability"` (compatibility.ts lines 20-24).
    Forcing every manifest/load diagnostic into `code: "capability"` discards
    the distinguishing code, so the Extensions panel and any downstream
    consumer cannot tell a missing-field error from an absolute-path error or
    a JSON parse failure.

    This is a contract mismatch between `packages/core` (which produces typed
    diagnostic codes) and the desktop bootstrap (which collapses them into a
    single bucket). It also makes programmatic handling or filtering by code
    impossible at the UI layer, and a future "show me all absolute-path
    errors" query cannot be answered. The message text is preserved, but the
    structured code — the part meant for machine consumption — is lost.

    A `BootstrapEntry.reasons` should carry the original diagnostic code (or a
    richer reason type that unions compatibility reasons with manifest
    diagnostics) instead of aliasing everything to `"capability"`.
- verification: |
    Read bootstrap.ts lines 183-188 and 271-275: both map diagnostics to
    `{ code: "capability" as const, message, severity }`, discarding
    `diagnostic.code`. Read compatibility.ts lines 20-24:
    `CompatibilityReason.code` is `"api-version" | "platform" | "capability"`.
    Read manifest.ts/loader.ts: diagnostics carry specific codes
    (`manifest_missing_field`, `entry_absolute_path`, `manifest_invalid_json`,
    etc.) that are dropped by the mapping.

- name: Dynamic migration runner is lenient about version mismatches and silently downgrades future-version files, unlike the legacy layer
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/dynamic.ts
- lines: 212-238 (also 243-247)
- description: |
    Two related gaps in `migrateDynamicSettingsObject` / `readDynamicSettingsVersion`:

    1. `readDynamicSettingsVersion` (lines 243-247) defaults any non-integer /
       negative / missing version to 0 and does NOT reject versions greater
       than `CURRENT_SETTINGS_VERSION`. The legacy `readSettingsVersion`
       (settings.ts:305-315) explicitly emits a `settings.version.unsupported`
       error diagnostic when `version > CURRENT_SETTINGS_VERSION` and falls
       back to defaults. The dynamic path instead treats a future-version
       document as v0, runs all migrations from v0 upward, and re-stamps
       `version = CURRENT_SETTINGS_VERSION` (line 236). A user who opens a
       newer settings file on an older app silently has its shape "migrated"
       from a version it never was, potentially corrupting/losing fields the
       app does not understand. This violates the "fail loudly" rule in
       global_rules.md.

    2. The per-step guard (lines 225-231) skips a migration step when
       `currentVersion !== step.fromVersion` rather than throwing, with a
       comment acknowledging this is "lenient compared to the legacy strict
       check" because "the dynamic system may have gaps in migration chains
       from extensions." Skipping a step means the record keeps flowing
       through the rest of the chain at the wrong version, so subsequent steps
       also get skipped — a single gap silently disables the tail of the
       chain. At minimum this should emit a diagnostic
       (`settings.migration_skipped`) so callers know data may be unmigrated,
       rather than returning `diagnostics: []` (line 125) as if everything
       succeeded.

    Fix: mirror the legacy behavior — reject `version > CURRENT` with an
    error diagnostic and return defaults; and emit a warning diagnostic (with
    the skipped `fromVersion`) when a migration step is skipped due to version
    mismatch, instead of silently `continue`.
- verification: |
    Read dynamic.ts (lines 212-247) and the legacy settings.ts
    `readSettingsVersion` (lines 283-318) and `migrateSettingsObject`
    (lines 190-224, which throws on version mismatch). Confirmed the dynamic
    path neither rejects future versions nor reports skipped migrations.

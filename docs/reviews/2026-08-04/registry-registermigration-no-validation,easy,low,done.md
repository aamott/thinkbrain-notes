- name: `registerMigration` performs no validation (no `fromVersion < toVersion`, no duplicate-fromVersion guard)
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/registry.ts
- lines: 86-88 (also 212-238 in dynamic.ts)
- description: |
    `registerMigration` (registry.ts:86-88) simply pushes onto the
    `migrations` array. It does not check:
      - `migration.fromVersion < migration.toVersion` (a backwards or no-op
        step is silently accepted and would corrupt the version field),
      - that no existing migration shares the same `fromVersion` (two steps
        from v0 would both run, the second seeing an already-migrated record
        and either no-op'ing or erroring inside `step.migrate`),
      - that `fromVersion`/`toVersion` are non-negative integers.

    The migration runner (`migrateDynamicSettingsObject`, dynamic.ts:212-238)
    sorts by `fromVersion` and skips on version mismatch, so duplicate
    `fromVersion` steps would both attempt to run against the same source
    version — the first wins, the second sees a bumped version and is
    skipped, but only by luck of the sort order. A `fromVersion >=
    toVersion` step would set `value.version` backwards and potentially
    re-trigger earlier migrations in a re-parse loop.

    Fix: in `registerMigration`, throw on `fromVersion >= toVersion`, on
    non-integer/negative versions, and on a duplicate `fromVersion` (mirror
    the duplicate-module-id throw on lines 69-73). This catches misconfigured
    extension migrations at registration time rather than at first parse.
- verification: |
    Read registry.ts (lines 86-92) and dynamic.ts (lines 212-238).
    Confirmed `registerMigration` is an unchecked push and that the runner
    relies on sort + version-match skip with no registration-time guards.

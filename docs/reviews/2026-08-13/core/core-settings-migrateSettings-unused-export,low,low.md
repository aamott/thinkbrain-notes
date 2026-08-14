- name: migrateSettings export unused outside tests
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings.ts
- lines: 197-202
- description: `migrateSettings` is exported as a public API but has no production consumer. Grepping `apps/` for `migrateSettings` returns 0 matches; the only callers are `packages/core/src/settings.test.ts`. The desktop layer goes through `parseAppSettings` (which calls `migrateSettingsObject` internally) rather than this public `migrateSettings` wrapper.

  This is a thin wrapper: `migrateSettings` just calls `migrateSettingsObject` then `normalizeAppSettings` and returns `.settings`. It re-exposes functionality already reachable via `parseAppSettings`. If no external consumer is planned, it can be inlined or removed. If kept as a public API for programmatic migration, document that intent on the export so reviewers do not re-flag it.

- verification: Grepped `migrateSettings\b` across `apps/` — 0 matches. Grepped across `packages/` — only `settings.ts` (definition) and `settings.test.ts` (test), plus a doc comment in `settings/dynamic.ts`.
- savings: ~6 lines if removed; 0 if kept as documented public API.

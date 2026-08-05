- name: registerMigration does not detect overlapping migration ranges
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/registry.ts
- lines: 95-116
- description: `registerMigration` rejects a duplicate `fromVersion` (lines
  108-114) and validates `fromVersion < toVersion` and non-negative versions,
  but it does not detect overlapping ranges. Two migrations such as
  `0 -> 2` and `1 -> 3` would both register successfully. The persistence
  layer (`dynamic.ts` line 257) sorts migrations by `fromVersion` and applies
  them in order, which could apply `0 -> 2` then `1 -> 3`, double-advancing
  or re-running a step on already-migrated data.

  This is a latent ambiguity in the migration chain. For the current built-in
  set (no migrations registered by default) it is harmless, but the
  fail-loudly principle suggests the registry should reject overlapping ranges
  at registration time rather than relying on the applier to cope.

  Suggested fix: when registering a migration, check that no existing
  migration's `[fromVersion, toVersion)` range intersects the new one, and
  throw with a message identifying both ranges.
- verification: Read `packages/core/src/settings/registry.ts` lines 95-116.
  Confirmed only `fromVersion` equality is checked. Confirmed via grep that
  `dynamic.ts` line 257 sorts and applies migrations linearly without its own
  overlap guard.

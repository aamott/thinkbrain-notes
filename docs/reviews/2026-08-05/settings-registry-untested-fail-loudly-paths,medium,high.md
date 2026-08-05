- name: Settings registry fail-loudly paths lack test coverage
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/registry.ts
- lines: 95-116, 169-207
- description: The registry adds several fail-loudly guards that are exercised
  only on the happy path in `registry.test.ts`. The following throw branches have
  no unit test confirming they fire:

  1. **Cross-module section ID collision** (lines 191-196): `collectSection`
     enforces global uniqueness of section ids via `sectionOwners`. The diff
     introduces this guard, but no test registers two modules with the same
     section id and asserts the throw. `getDefinitionsForSection` silently
     returns the first match in `moduleOrder`, so a regression that removes the
     guard would shadow data without any test failure.

  2. **Duplicate setting key within a module** (lines 179-183): `collectSection`
     throws when two settings in the same module resolve to the same full key.
     No test registers a module with two settings sharing a relative key and
     asserts the throw.

  3. **Migration validation** (lines 98-114): `registerMigration` throws for
     negative `fromVersion`/`toVersion`, for `fromVersion >= toVersion`, and for
     a duplicate `fromVersion`. The only migration test (lines 98-109 of
     `registry.test.ts`) covers the happy path (0 -> 1). None of the three
     throw paths are tested.

  The plan's acceptance criteria require "Unit tests cover registration, lookup,
  and duplicate-id handling" and the project's fail-loudly rule says errors must
  be logged clearly and surfaced. Untested throw paths can be silently removed
  during refactoring, defeating the fail-loudly guarantee.
- verification: Read `packages/core/src/settings/registry.ts` (lines 95-116,
  169-207) and `packages/core/src/settings/registry.test.ts` (full file,
  370 lines). Confirmed via grep that no test references "already registered by
  another", "Duplicate setting key", "fromVersion", "toVersion" in a throw
  assertion context. The only `throw`-asserting test is "throws on duplicate
  module id" (line 60).

- name: SettingsDiagnostic is re-exported from two `export *` paths, contradicting the settings/index.ts comment and creating an ambiguous root export
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/index.ts
- lines: 5-12 (also types.ts:10-14, src/index.ts:68-72)
- description: |
    `settings/index.ts` lines 5-9 document that `SettingsDiagnostic` is
    "intentionally NOT re-exported here to avoid a duplicate-export collision
    with `../settings` ... when both are re-exported from
    `packages/core/src/index.ts`." But line 12 does `export * from "./types"`,
    and `types.ts` line 14 explicitly re-exports it:
      `export type { SettingsDiagnostic };`  (imported from `../settings` on line 10)
    So `SettingsDiagnostic` IS surfaced from `./settings/index`.

    In `src/index.ts`:
      line 68: `export * from "./settings";`        // declares SettingsDiagnostic (settings.ts:14)
      line 72: `export * from "./settings/index";`  // re-exports it via types.ts:14

    Per TypeScript `export *` semantics, when the same name is brought in from
    two `export *` sources it becomes ambiguous and is OMITTED from the
    re-exporting module's public surface. Consumers doing
    `import { SettingsDiagnostic } from "@thinkbrain/core"` will fail to
    resolve the type. The comment in `settings/index.ts` is wrong about the
    current behavior, and the safety it claims to provide is not actually in
    place.

    Fix: either drop the `export type { SettingsDiagnostic }` re-export from
    `types.ts` (and have `validation.ts`/`dynamic.ts` import it directly from
    `../settings` instead of from `./types`), OR make the comment true by not
    re-exporting `types` wholesale. The cleanest fix is to remove line 14 from
    `types.ts` and change `validation.ts:12` and `dynamic.ts:14` to import
    `SettingsDiagnostic` from `../settings` directly (dynamic.ts already does;
    validation.ts currently imports it from `./types`).
- verification: |
    Read types.ts (lines 10-14), settings/index.ts (lines 5-12), src/index.ts
    (lines 68-72), and grep for `SettingsDiagnostic` across packages/core/src
    confirming it is declared in settings.ts:14 and re-exported in types.ts:14.
    No build was run per review constraints; conclusion is from TS `export *`
    ambiguity rules.

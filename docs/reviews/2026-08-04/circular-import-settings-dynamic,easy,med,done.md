- name: Circular value import: settings.ts re-exports from ./settings/dynamic while dynamic.ts imports the CURRENT_SETTINGS_VERSION value from ../settings
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings.ts
- lines: 4-8 (also dynamic.ts:15)
- description: |
    settings.ts:4-8 does:
      `export { parseDynamicAppSettings, ... } from "./settings/dynamic";`
    and dynamic.ts:15 does:
      `import { CURRENT_SETTINGS_VERSION } from "../settings";`
    where `CURRENT_SETTINGS_VERSION` is a `const` value (settings.ts:10), not
    a type. This forms a runtime cycle: settings.ts -> dynamic.ts -> settings.ts.

    It happens to work today only because dynamic.ts uses
    `CURRENT_SETTINGS_VERSION` exclusively inside function bodies
    (dynamic.ts:190, 236), not at module top level, so the live binding is
    resolved by the time those functions are called rather than during module
    evaluation. But the cycle is fragile: any future top-level use of
    `CURRENT_SETTINGS_VERSION` (or any other value) in dynamic.ts would hit
    the TDZ and throw at import time, and the dependency graph makes it hard
    to reason about initialization order. It also muddies the
    "platform-agnostic core / legacy vs modular" layering.

    Fix: move `CURRENT_SETTINGS_VERSION` (and ideally
    `SettingsDiagnostic`/`SettingsDiagnosticSeverity`) into a small
    platform-agnostic leaf module that both `settings.ts` and
    `settings/dynamic.ts` import from — e.g.
    `packages/core/src/settings/version.ts` or `settings/internal.ts`. Then
    settings.ts re-exports it for back-compat and dynamic.ts imports from the
    leaf, breaking the cycle.
- verification: |
    Read settings.ts (lines 4-10) and dynamic.ts (lines 12-15, 190, 236).
    Confirmed the value import cycle and that all usages are inside
    functions (no top-level evaluation), which is why it currently does not
    throw.

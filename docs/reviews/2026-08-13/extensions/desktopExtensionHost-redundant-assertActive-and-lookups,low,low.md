- name: Redundant assertActive and getDefinition lookups in desktop extension settings
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/desktopExtensionHost.ts
- lines: 264-267, 315-342
- description: |
    Two minor redundancies in the scoped settings/context helpers:

    1. **Double `assertActive`**: every `register` callback calls `assertActive()`
       at the top, then passes `assertActive` into `own()`, which calls it again
       (line 265) before `context.subscriptions.add`. Between the caller's check
       and `own`'s check nothing async runs (registry `register` is synchronous),
       so the second check can never fire when the first passed. Either drop the
       `assertActive` parameter from `own` (callers already guard) or remove the
       caller-side check and rely on `own`. The former is safer and clearer.

    2. **Repeated `getDefinition` lookups**: `fullSettingKey` (lines 221-229)
       already calls `appSettingsRegistry.getDefinition(fullKey)` and throws if
       missing. Then `settings.get` (line 319) and `settings.onDidChange`
       (line 332) each call `appSettingsRegistry.getDefinition(fullKey)` again
       on the same validated key. The definition is fetched 2x per `get`/`onDidChange`
       call. `fullSettingKey` could return `{ fullKey, definition }` to avoid the
       re-lookup, or the callers could trust the validated key and look up once.
- verification: |
    Read lines 264-267 (`own`), 215-229 (`fullSettingKey`), 309-343 (settings
    object). Confirmed `own`'s `assertActive` param is always the same closure
    the caller already invoked, and that `getDefinition` is called inside
    `fullSettingKey` and again at each use site.
- savings: ~3 lines for `own` simplification; ~2 redundant lookups removed (no
  line savings, minor perf).

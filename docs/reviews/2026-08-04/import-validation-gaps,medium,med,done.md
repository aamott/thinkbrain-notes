- name: Import validation gaps — no enum/range/regex checks, bare-object heuristic misclassifies
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/settingsImportExport.ts
- lines: 144-165 (isValueTypeValid), 179-195 (extractSettingsMap), 209-254 (importSettings)
- description: |
    Several type-safety and validation gaps in the import path:

    1. `isValueTypeValid` (lines 144-165) only checks the *base* type. It does NOT validate:
       - `enum` options are checked (line 157-160) — good.
       - `number` ranges / min / max (e.g. `editor.fontSize` likely has a min) — NOT checked. An imported `fontSize: -5` or `fontSize: 99999` passes `Number.isFinite` and gets staged. Range validation only happens later at `saveSettings()` via `validateSettings` (settingsStore.ts:351-359), so the user can stage an out-of-range value and only discover it on Save. The import result reports it as `imported` (success), misleading the user.
       - `string` regex/pattern constraints (if any definition has one) — NOT checked.
       - `path` — only checks it's a string (line 153-155); no existence/format validation. Acceptable for import (paths may not exist on this machine), but worth noting.

    2. `extractSettingsMap` (lines 179-195) bare-object heuristic: if a parsed object has neither `settings` nor `version`, it returns the whole object as the settings map (line 194). This means a user who accidentally picks an arbitrary JSON file (e.g. a `package.json`, a frontmatter doc, any random `{}`) will have its top-level keys interpreted as setting keys. Most will be `ignored` (unknown keys), but any key that happens to match a setting key (e.g. `appearance.theme`, `editor.fontSize`) will be staged with whatever value is in that file. There is no schema/signature check (e.g. a `thinkbrain-settings` marker, or requiring the canonical `{version, settings}` shape). The doc comment (lines 187-189) acknowledges the heuristic but the fallback is too permissive.

    3. `importSettings` (lines 219-222): on malformed JSON it returns `{ imported: 0, ignored: 0, typeMismatches: 0 }` — silently reporting success with zero counts. The user gets no signal that the file was unparseable; it looks identical to an empty-but-valid import. Per "fail loudly", this should either throw, return a distinct error result (e.g. `ImportResult` extended with an `error?: string`), or at minimum log to console. Same for the `extractSettingsMap === null` branch (line 225-227).

    4. `importSettings` reads `useSettingsStore.getState()` once (line 229) and calls `store.stageChange` in a loop. If a concurrent `loadSettings` (see race finding) fires between reads, staged values could be wiped mid-loop. Lower severity than the load race but related.

- verification: |
    Read isValueTypeValid:144-165 — only base type + enum options; no min/max/range/pattern.
    Read extractSettingsMap:179-195 — bare object returned as settings map with no marker check.
    Read importSettings:216-227 — malformed JSON and null map both return zero-count success with no error signal.
    Confirmed range validation is deferred to saveSettings via validateSettings (settingsStore.ts:351-359).

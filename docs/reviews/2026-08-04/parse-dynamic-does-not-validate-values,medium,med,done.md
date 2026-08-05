- name: `parseDynamicAppSettings` returns unvalidated values; invalid persisted values pass through with no diagnostic
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/dynamic.ts
- lines: 114-125 (also 49-126)
- description: |
    `parseDynamicAppSettings` merges `record[def.key]` over `defaults`
    (dynamic.ts:116-123) and returns `{ values, diagnostics: [] }` (line 125)
    without ever calling `validateSettings(registry, values)`. The doc string
    (lines 22-23, 46-47) says diagnostics cover "invalid JSON, bad shape, or
    migration failures" — which is technically accurate — but a caller
    reasonably expects that a successful parse (empty diagnostics) yields a
    clean values map. In reality a file containing `{"editor.fontSize":
    "abc", "appearance.theme": "purple"}` parses with `diagnostics: []` and
    surfaces the bad values directly into the settings model. The legacy
    `parseAppSettings` (settings.ts:101-169) normalizes/validates inline and
    reports per-field diagnostics, so the two systems diverge in safety.

    This is a design decision worth confirming, but given the "fail loudly"
    rule and the existence of a dedicated `validateSettings` in the same
    package, the parse function should at least offer a validated path.
    Options:
      (a) Run `validateSettings(registry, values)` before returning and
          append the diagnostics (with `severity: "error"`, `path` set) to
          the result. Decide whether invalid values are kept (caller drops
          them) or replaced with defaults per-key.
      (b) Keep parse and validate separate but rename the result field /
          document explicitly that `values` is unvalidated and callers MUST
          run `validateSettings` before use, and have the desktop consumer do
          so.

    As written, the silent pass-through is a footgun, especially since
    `serializeDynamicAppSettings` (lines 145-193) will happily write the bad
    values back to disk, persisting the invalid state.

- verification: |
    Read dynamic.ts (lines 49-126, 145-193) and validation.ts (lines 25-38).
    Confirmed `parseDynamicAppSettings` never calls `validateSettings` and
    returns `diagnostics: []` on the success path regardless of value
    validity. Compared with legacy `parseAppSettings` (settings.ts:101-169)
    which normalizes and reports per-field diagnostics.

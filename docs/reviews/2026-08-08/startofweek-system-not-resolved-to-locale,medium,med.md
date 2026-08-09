- name: "system" start-of-week setting is treated as Sunday, never resolved to OS locale
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/builtins/journal.tsx
- lines: 170
- description: |
    The `startOfWeek` setting (`journalSettings.ts` lines 66-75) offers three
    options — `["system", "monday", "sunday"]` — with `default: "system"`. The
    extension resolves this to a `WeekStart` (0 | 1) once, at tab-factory
    invocation:
    ```ts
    weekStartsOn={context.settings.get<string>("startOfWeek") === "monday" ? 1 : 0}
    ```
    Any value other than `"monday"` yields `0` (Sunday). So `"system"` — the
    default — is indistinguishable from `"sunday"`, even on locales whose
    calendar starts on Monday (most of Europe, ISO 8601). The setting's label
    "First day of the week" and option text "system" promise locale-aware
    behavior that is never delivered. To honor `"system"`, the resolver needs
    `Intl.Locale(...).weekInfo.firstDay` (or `Environment.localeFirstDayOfWeek`
    via Tauri) mapped to 0/1.
- verification: |
    Read `journalSettings.ts` lines 66-75 (enum options include `"system"`,
    default `"system"`, scope `app`). Read `journal.tsx` line 170: the only
    branch is `=== "monday" ? 1 : 0`; no `"system"` branch and no locale lookup.
    `CalendarTabContainer` defaults `weekStartsOn` to `0` (line 41) but the
    extension always passes an explicit value, so the default is not the
    fallback path.

## Investigation notes (2026-08-08, unverified)

Written from reading only — no code was changed and none of this was run.
Treat it as a lead, not a conclusion.

`"system"` collapses to Sunday in
`builtins/journal.tsx` (`=== "monday" ? 1 : 0`). `new Intl.Locale(...).weekInfo.firstDay`
reportedly resolves without a polyfill on this Node version, and happy-dom's default
`navigator.language` is `en-US`, so a test can pin the locale rather than depend on the
machine. Worth doing together with the reactivity item — same call site.

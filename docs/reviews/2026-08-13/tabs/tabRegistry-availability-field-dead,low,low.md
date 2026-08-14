- name: DesktopTabView.availability field duplicates isAvailable and is never read
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/tabRegistry.ts
- lines: 26 (interface), 40-73 (builtInDesktopTabViews)
- description: `DesktopTabView` declares both `availability: "available" | "unavailable"` (line 26) and inherits `isAvailable: boolean` from `TabRegistration` (core). Every entry in `builtInDesktopTabViews` sets both fields to consistent values (`isAvailable: true` + `availability: "available"`, or `isAvailable: false` + `availability: "unavailable"`). The `availability` field is never read by any consumer:

  - `TabContent.tsx` line 65 checks `view?.isAvailable` (the boolean), not `view?.availability`.
  - A repo-wide grep for `\.availability\b` in `apps/desktop/src` finds matches only in `panelRegistry`, `commandRegistry`, and their consumers — never in `tabRegistry` consumers.
  - The `tabRegistry.test.ts` assertions check both fields, but the `availability` assertions are testing dead data.

  The `availability` field can be removed from `DesktopTabView`, `builtInDesktopTabViews`, and `tabRegistry.test.ts`. Where a string is needed, derive it from `isAvailable` (`isAvailable ? "available" : "unavailable"`). The `unavailableMessage` field is still needed (it is read at `TabContent.tsx` line 69).

- verification: Read `tabRegistry.ts` lines 25-73. Grepped `\.availability\b` across `apps/desktop/src` — all matches are in panel/command registries, not tab consumers. Read `TabContent.tsx` line 65 confirming `isAvailable` is the field used.
- savings: ~8 lines removed (5 `availability` lines in built-in views, 1 interface line, 2 test assertion lines).

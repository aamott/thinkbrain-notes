# isBuiltInLeftPanel duplicates the built-in id list and can drift silently

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/panelRegistryModel.tsx`
- **Lines:** 92–97, 155–161

## Description

`BuiltInLeftPanel` is a hand-maintained union (`"explorer" | "search" |
"conflicts" | "tags" | "extensions"`), `builtInDesktopPanels` is a
hand-maintained array, and `isBuiltInLeftPanel` repeats the same five ids as
a literal `===` chain. Three sources of truth for one list: a new
first-party left panel added to the union and the table but not the guard
still compiles (the guard's return type is satisfied by *narrowing*), and
`useShellCommands.ts:113` then silently drops the panel from the
`selectLeftPanel` path while `PhoneShell` uses `isSelectableLeftPanel`
instead — two behaviors for the same question.

The test at `panelRegistry.test.tsx:272–278` iterates its own literal list,
so it would not catch the drift either.

## Recommendation

Derive the guard from the table or a shared constant:

```ts
const BUILT_IN_LEFT_PANEL_IDS = ["explorer", "search", "conflicts", "tags", "extensions"] as const;
export type BuiltInLeftPanel = (typeof BUILT_IN_LEFT_PANEL_IDS)[number];
export const isBuiltInLeftPanel = (id: string): id is BuiltInLeftPanel =>
  (BUILT_IN_LEFT_PANEL_IDS as readonly string[]).includes(id);
```

…or simply `return getDesktopPanelOrUndefined(id)?.side === "left" && !id.includes(".")`,
matching the registry-backed semantics `isSelectableLeftPanel` already
documents. A unit test asserting parity between the guard and
`builtInDesktopPanels.filter(p => p.side === "left")` would also work.

## Verification

`panelRegistryModel.tsx:155–161` is a literal comparison chain; nothing
cross-checks it against `builtInDesktopPanels` (lines 263–385) or the union
(lines 92–97). `useShellCommands.ts:113` and `shellTypes.ts:50–60` show the
two divergent "may this be the open left panel" definitions.

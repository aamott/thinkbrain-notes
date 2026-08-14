- name: createDesktopEditorHeaderRegistry is a zero-behavior pass-through wrapper
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/editorHeaderRegistry.ts
- lines: 50-54
- description: `createDesktopEditorHeaderRegistry` adds no behavior over `createContributionRegistry`:

  ```ts
  export function createDesktopEditorHeaderRegistry(
    initialHeaders: readonly DesktopEditorHeaderContribution[] = []
  ): DesktopEditorHeaderRegistry {
    return createContributionRegistry(initialHeaders);
  }
  ```

  `DesktopEditorHeaderRegistry` is just a type alias for `ContributionRegistry<DesktopEditorHeaderContribution>` (line 41-42). The factory wraps `createContributionRegistry` without adding ordering, filtering, or any other behavior. This is over-abstraction: a wrapper adding a layer but no behavior.

  The singleton at line 57 could be created directly:
  ```ts
  export const desktopEditorHeaderRegistry =
    createContributionRegistry<DesktopEditorHeaderContribution>();
  ```

  The factory function can be kept if tests or extensions construct their own instances, but the 7-line factory body could be a one-liner. Callers that need a fresh registry (tests at `editorHeaderRegistry.test.tsx`) can call `createContributionRegistry<DesktopEditorHeaderContribution>()` directly, or the factory can remain as a named convenience with an inline body.

  Compare with `createDesktopEditorHookRegistry` (`editorHookRegistry.ts`) which DOES add behavior (`orderedEntries`, `getExtensions`, `getKeybindings`) — that factory is justified.

- verification: Read `editorHeaderRegistry.ts` lines 40-57. The factory body is a single `return createContributionRegistry(initialHeaders)`. Grepped `createDesktopEditorHeaderRegistry` — used in `editorHeaderRegistry.tsx` (default param), `editorHeaderRegistry.test.tsx`, `desktopExtensionHost.ts`, and tests. The type alias `DesktopEditorHeaderRegistry` is used in `editorHeaderRegistry.tsx`.
- savings: ~4 lines if factory is removed and singleton uses `createContributionRegistry` directly; ~2 lines if factory body is inlined.

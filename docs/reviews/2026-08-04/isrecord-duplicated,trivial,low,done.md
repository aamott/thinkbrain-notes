- name: `isRecord` helper duplicated in three (four) files
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/settingsStore.ts
- lines: 225-227 (also settingsImportExport.ts:126-128, desktopState.ts:226-228, packages/core/src/settings/dynamic.ts:250-252)
- description: |
    The identical type guard
    ```
    function isRecord(value: unknown): value is Record<string, unknown> {
      return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }
    ```
    is copy-pasted verbatim in:
      - `apps/desktop/src/settings/settingsStore.ts:225`
      - `apps/desktop/src/settings/settingsImportExport.ts:126`
      - `apps/desktop/src/settings/desktopState.ts:226`
      - `packages/core/src/settings/dynamic.ts:250`

    Four copies of the same predicate. Any future refinement (e.g. handling `null` more strictly, or adding a branded type) must be applied in four places, and divergence is silent.

    Recommended fix: export a single `isRecord` from a shared location. `packages/core` is platform-agnostic and already owns `dynamic.ts`'s copy; export it from `@thinkbrain/core` and import it in the three desktop files. (Note: `apps/desktop/src/lib/utils.ts` is the app-wide utility home per AGENTS.md module map — a desktop-local shared helper there is also acceptable if keeping it out of core is preferred.)

- verification: |
    grep `isRecord` across apps/desktop/src → 9 matches across the three settings files (definition + 2 call sites each).
    Read each definition site: all four bodies are byte-identical.

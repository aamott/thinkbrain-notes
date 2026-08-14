- name: Dead code — unused controls barrel and unused clearAutosaveTimer export
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/controls/index.ts
- lines: 1-7
- description: |
    `apps/desktop/src/settings/controls/index.ts` is a barrel re-exporting the
    five standard controls. No file in the repo imports from
    `settings/controls` (the barrel path). `controlRegistry.ts` imports each
    control directly from its own module (lines 18-22). The barrel adds a file
    and an indirection layer with no callers.

    Separately, `clearAutosaveTimer` in
    `apps/desktop/src/settings/autosaveScheduler.ts` (lines 40-42) is exported
    but never imported anywhere in the repo. The docstring says "Intended for
    tests that need to reset the module-level timer between cases" but no test
    uses it (grep confirms only the definition site matches).

    Both can be deleted. Estimated savings: ~10 lines across 2 files.
- verification: |
    `grep -r "from.*settings/controls"` returns no matches in
    `apps/desktop/src`. `grep -r "clearAutosaveTimer"` matches only
    `autosaveScheduler.ts` line 40 (the definition).

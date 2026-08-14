- name: LocalExtensions.add has a TOCTOU race on concurrent adds of the same directory
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/localExtensions.ts
- lines: 96-113
- description: |
    `add(directory)` checks whether the directory is already loaded
    (`bootstrap.entries().find((entry) => entry.directory === directory)`) and
    returns a `failed(...)` outcome if so. But the check and the subsequent
    `load(directory)` (which calls `bootstrap.addLocalExtension`) are not atomic:
    `load` awaits `loader.load(directory)` before registering. Two concurrent
    `add` calls for the same directory both pass the check (neither is in
    `entries` yet), both load, and the second `bootstrap.addLocalExtension`
    throws `Extension "X" is already registered.` That throw propagates out of
    `load` to `add`'s caller — `add` does not catch it, so the Extensions panel's
    `run` wrapper surfaces a raw "already registered" error to the user, while
    the first `add` succeeds and persists the directory.

    The same shape affects two different directories that bundle the same
    extension id (e.g. two copies of the same extension): both pass the
    directory check, the second throws a confusing "already registered" message
    that names the id, not the directory.

    Mitigations: catch the `addLocalExtension` throw inside `add` and convert it
    to a `failed(...)` outcome with a clear code; or track in-flight
    `add(directory)` promises and join on them.
- verification: |
    Read lines 96-113 (`add`) and 87-93 (`load`). Confirmed the check at line 97
    runs before the awaited `load` at line 105, and that `load` calls
    `bootstrap.addLocalExtension` (line 91) which throws synchronously on a
    duplicate id (bootstrap.ts line 263). `add` has no try/catch around `load`,
    so the throw escapes. The Extensions panel's `run` (ExtensionsPanel.tsx
    lines 69-83) catches it as a generic error string.

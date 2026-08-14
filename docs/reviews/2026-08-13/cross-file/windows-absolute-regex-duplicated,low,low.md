- name: WINDOWS_ABSOLUTE regex duplicated across core loader and desktop workspace
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/extensions/loader.ts
- lines: 33
- description: |
    `const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;` is defined identically in two
    files:

    - `packages/core/src/extensions/loader.ts` line 33 (validates the manifest
      `main` entry path).
    - `apps/desktop/src/extensions/extensionWorkspace.ts` line 55 (validates
      extension-supplied note paths).

    Both reject Windows drive-letter absolute paths as a path-escape guard. The
    core package is the natural home for a shared path-validation helper, and
    `loader.ts` already exports `resolveEntryPath` for the same family of
    checks. A small shared `isWindowsAbsolutePath` (or a `pathGuards` module) in
    `packages/core/src/extensions` would let the desktop workspace import it
    instead of re-declaring the regex.

    This is a minor duplication — one line — but the two copies can drift (e.g.
    one accepting `file:` URLs) and the rule is the same security-relevant
    check, so consolidating is worth it.
- verification: |
    `grep` for `WINDOWS_ABSOLUTE` across the repo: exactly two definition sites
    (loader.ts:33, extensionWorkspace.ts:55), both
    `/^[A-Za-z]:[\\/]/`. No other copies. The core package is platform-agnostic
    and already owns path-validation rules for extensions.
- savings: 1 line; the real value is preventing drift on a security-adjacent
  check.

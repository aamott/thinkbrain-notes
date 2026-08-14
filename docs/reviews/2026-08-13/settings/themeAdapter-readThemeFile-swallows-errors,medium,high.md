- name: readThemeFile silently swallows read errors, contradicting its own docstring and the fail-loud rule
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/themeAdapter.ts
- lines: 54-81
- description: |
    `readThemeFile` catches every error from `invokeNativeCommand("read_theme_file", …)`
    and returns `null` (lines 76-80). The docstring (lines 68-73) explicitly says
    "Read errors are swallowed here and surfaced by the caller (`ThemeProvider`)
    via its `.catch` handler — returning `null` would conflate 'missing' with
    'broken', so we re-throw nothing and let the caller's catch handle native
    errors."

    That contract is broken by the implementation: the `try/catch` returns `null`
    on *any* failure, so the caller's `.catch` (ThemeProvider.tsx lines 208-217)
    never fires. The `.then()` branch (line 176) treats `null` as "non-Tauri
    context" and silently no-ops. The net effect is that a real read failure
    (permission denied, I/O error, corrupt path) is indistinguishable from "no
    file" or "running outside Tauri" — the user sees no error, the theme just
    silently doesn't apply, and the fail-loud `console.error` in the caller's
    catch is dead code for this path.

    Fix: remove the `try/catch` (let the rejection propagate to the caller's
    `.catch`), or distinguish "non-Tauri" (return `null`) from "native error"
    (re-throw). The non-Tauri guard on line 75 already returns early, so the
    `try/catch` only wraps the native call and can be removed entirely.
- verification: |
    Read themeAdapter.ts lines 74-81: the `try/catch` wraps only the
    `invokeNativeCommand` call (line 77) and returns `null` on any error.
    Read ThemeProvider.tsx lines 172-226: the `.then()` handler checks
    `if (raw === null) return;` (line 176) before the `.catch` handler (line 208).
    Since `readThemeFile` never rejects (it catches everything), the `.catch`
    block is unreachable for read errors. Grep for `readThemeFile` confirms
    ThemeProvider is the only caller.

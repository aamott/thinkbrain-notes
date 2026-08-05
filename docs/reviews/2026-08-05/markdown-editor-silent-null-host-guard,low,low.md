- name: MarkdownEditor mount effect silently aborts when host ref is null
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/MarkdownEditor.tsx
- lines: 37-59
- description: |
    The CodeMirror mount effect opens with `if (!hostRef.current) return;` (line 38).
    If the host div is ever absent when the effect runs, the editor silently never
    initializes and there is no log, no error, and no fallback UI — the user sees an
    empty editor region. This contradicts the project's fail-loudly rule
    (AGENTS.md: "If a command fails, it should fail loudly and provide a clear error
    message").

    In practice React sets the ref before the effect runs, so this branch is
    defensive. But defensive silent returns are exactly the kind of hidden failure
    the fail-loudly rule targets: if a future refactor (e.g., conditional rendering
    of the host div, or StrictMode double-invoke quirks) makes `hostRef.current`
    null, the failure will be invisible. Prefer `console.error("[MarkdownEditor]
    host element missing; cannot mount CodeMirror.")` before returning, or throw,
    so the failure is diagnosable.
- verification: |
    Read MarkdownEditor.tsx:37-59; the guard returns with no logging. Compared with
    the fail-loudly rule in AGENTS.md and the global_rules memory.

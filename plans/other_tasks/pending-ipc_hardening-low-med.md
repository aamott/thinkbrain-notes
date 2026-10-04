# Task: Defense-in-depth for the IPC surface

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** med

> From the 2026-10-03 simplification review. None of these is exploitable
> today — there is no HTML sink and extensions are trusted same-realm code —
> but each would widen the blast radius of a future renderer bug.

## Findings

1. **Workspace root is renderer-chosen.** `resolve_workspace_root`
   (`workspace_paths.rs`) accepts any existing absolute directory, so every
   containment check is relative to a root the renderer picked
   (`read_text_file("/", "etc/passwd")` succeeds). Same for
   `read_extension_file`'s `directory`. Option: a `RegisteredRoots` set filled
   by `open_workspace`/`open_workspace_window`/managed-workspace creation, and
   dev-extension dirs from desktop state; file commands reject anything else.
2. **`csp: null`** in `tauri.conf.json`. A CSP must allow `blob:` scripts
   (local extensions load via `URL.createObjectURL`), `asset:` images and
   inline styles (Tailwind/CodeMirror), plus dev HMR. Needs a manual run of
   the app to verify.
3. **Asset-protocol grants never revoke.** `open_workspace` calls
   `allow_directory(root, true)` per open; grants are process-global and live
   for the session. Revoke when the last window releases a vault (count like
   `WatchInterest`).

## Not done because

Each needs a design choice and a manual app run rather than a mechanical fix.

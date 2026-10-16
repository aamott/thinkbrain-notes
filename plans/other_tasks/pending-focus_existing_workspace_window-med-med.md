# Story: Re-opening a workspace focuses its existing window

Found while testing `workspace_session_owner`: picking a workspace from the
selector dropdown when a window already shows it spawns a *second* window
instead of focusing the first. Pre-existing — `launchWorkspace` has always
called `open_workspace_window` unconditionally; the session table's launch
records (`workspace_session::launched_root`) only answer "what root did this
window get", not "which windows show this root".

## Approach

- The session table already holds `launched: HashSet<String>` per root — add a
  `launched_labels(root) -> Vec<String>` query and use it in
  `open_workspace_window`/`create_workspace_window_off_main_thread`:
  if a launched window for the root still exists, `set_focus()` it instead of
  building a new one.
- `register_launch` only runs for spawned windows, so the *main* window's root
  is not in the launch table. Register it at startup or fall back to its watch
  record — otherwise reopening the root the main window shows still spawns a
  duplicate.
- Mobile ignores this path (`opensWorkspaceInNewWindow: false` opens in
  place), so it is desktop-only work.
- Edge: a window can be mid-launch (registered but not yet watching). Focusing
  it is still correct — it is already loading that root.

## Acceptance

- Picking the open workspace from the selector focuses its existing window —
  including when the existing window is the main one.
- Picking a workspace no window shows still opens a new window.
- The workspace manager offers both outcomes explicitly ("Open in another
  window" and "Focus") rather than silently choosing.
- Destroyed-window launch records are already reaped by `release_window`, so a
  stale label cannot be focused — verify this is true after the change.

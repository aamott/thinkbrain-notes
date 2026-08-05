# Workspace window cleanup paths have no test coverage

- **Difficulty:** easy
- **Urgency:** low
- **File:** `apps/desktop/src-tauri/src/lib.rs`
- **Lines:** 1859-1888 (test), 728-756 (code under test)

## Description
The only new test, `workspace_window_roots_are_scoped_to_opaque_window_labels`, exercises the leaf helpers `next_workspace_window_label`, `register_workspace_window_root`, `workspace_window_root`, and `unregister_workspace_window_root`. It does **not** cover the two lifecycle-critical orchestration paths added in `open_workspace_window`:

1. The build-failure rollback that calls `unregister_workspace_window_root` inside `map_err` (lines 739-746).
2. The `WindowEvent::Destroyed` handler that calls `unregister_workspace_window_root` (lines 748-755).

These are exactly the paths that prevent state leaks, and they are the ones most likely to regress silently. Additionally, the test mutates the process-global `WORKSPACE_WINDOW_SEQUENCE` `AtomicU64`, so the concrete label values are non-deterministic across parallel test runs; the existing assertions (`assert_ne`, `starts_with`) tolerate this, but any future assertion on exact labels would be flaky.

## Recommendation
Extract the register/build/rollback/destroy-install sequence into a small, pure, testable helper that takes an injected "build window" closure, then unit-test both failure paths:

```rust
fn stage_workspace_window<F>(
    app: &tauri::AppHandle,
    roots: &WorkspaceWindowRoots,
    root_path: String,
    build: F,
) -> Result<(), NativeError>
where
    F: FnOnce(&str) -> Result<tauri::WebviewWindow, NativeError>,
{
    let label = next_workspace_window_label();
    let window = build(&label).inspect_err(|_| {
        unregister_workspace_window_root(roots, &label);
    })?;
    let app_for_cleanup = app.clone();
    let label_for_cleanup = label.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            unregister_workspace_window_root(
                &app_for_cleanup.state::<WorkspaceWindowRoots>(),
                &label_for_cleanup,
            );
        }
    });
    register_workspace_window_root(roots, label, root_path);
    Ok(())
}
```

Then add tests asserting: (a) when `build` returns `Err`, the label is absent from `WorkspaceWindowRoots`; (b) after a simulated destroy, the label is absent. This also makes the fix for the register-before-build ordering verifiable without a live Tauri runtime.

## Resolution - WONTFIX

Registering a root only after a window has been built and its destroy handler
is installed removes the build-failure cleanup path entirely. The focused
registry test already verifies that destruction cleanup removes only the
targeted root. Exercising Tauri's `WebviewWindowBuilder` lifecycle would
require a live runtime; extracting a mock-only orchestration layer would add
indirection without testing the actual Tauri event timing.

## Verification
`git diff --cached -- apps/desktop/src-tauri/src/lib.rs` shows the new test (lines 1859-1888) only calls the four helper functions directly and never invokes `open_workspace_window` or simulates a build failure / destroy event. `read` of lines 728-756 confirms the rollback and destroy-handler logic exist only inside the `#[tauri::command]` body, which is not reachable from the test module.

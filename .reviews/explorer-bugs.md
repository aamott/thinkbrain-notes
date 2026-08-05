# Workspace Explorer Refactor Review

This review focuses on the files and concerns listed in the prompt. Real bugs are prioritized over stylistic issues.

---

## 1. Memory leaks / effect cleanup

### Finding: no listener/timer leaks, but async closures capture stale state
- **File**: `apps/desktop/src/workspace/WorkspaceExplorer.tsx` (esp. lines 50, 115–133)
- **Severity**: High (stale-closure behavior, not a leaked listener)
- **Details**: `useEffect` for the context menu (lines 194–208) correctly adds/removes `window` listeners on cleanup, and there are no uncleaned timers. The cleanup problem is instead **stale closures**: `runWithRefresh`, `submitCreate`, `submitRename`, `confirmDelete`, and `refreshEntries` all close over `state.snapshot` / `workspaceRootPath`. After any `await`, the callback continues to use the `state` object from the render that started the operation, not the current one. If the workspace is switched or closed while an operation is in flight, the stale closure will list the old root and dispatch `opened` with the wrong snapshot.
- **Fix**: Hold a `useRef` that is updated every render with the latest `state` (`stateRef.current = state`). Inside async helpers read `stateRef.current.snapshot` and, after each `await`, compare the workspace root before/after; abort the refresh/dispatch if the root changed.

---

## 2. Race conditions

### A. `runWithRefresh` is not serialized and `busy` is a simple boolean
- **File**: `apps/desktop/src/workspace/WorkspaceExplorer.tsx` lines 115–179
- **Severity**: High
- **Details**: `busy` is set `true` at the start of `runWithRefresh` and `false` in `finally`. Two quick actions (double-click, rapid context-menu choices, or a refresh running while a rename is in flight) can overlap. The first operation to finish sets `busy` to `false` while the second is still running, and `setActionError(null)` at the top of every call can erase the error from a still-in-flight operation. Tree buttons and context-menu items are not disabled while `busy` is true.
- **Fix**: Use a ref-based in-flight counter. Set `busy` only when the counter is > 0, and gate `runWithRefresh` so it either queues or ignores overlapping calls. Wire `disabled={isBusy}` through `WorkspaceTreeItem` and `WorkspaceContextMenu`.

### B. `runWithRefresh` dispatches a captured `state.snapshot`
- **File**: `apps/desktop/src/workspace/WorkspaceExplorer.tsx` lines 115–133, especially 120–123
- **Severity**: High
- **Details**: After `await operation()` the callback reads `state.snapshot` and `workspaceRootPath` from the closure, not from the latest state. A concurrent `loadWorkspace` / `openWorkspace` or a prop change can leave an old `runWithRefresh` callback that dispatches `{ type: "opened", snapshot: state.snapshot!, entries }` and overwrites the current explorer state.
- **Fix**: As above, read the latest state via a `stateRef`; re-verify the root path after every `await` and bail out if the workspace has changed.

---

## 3. State bugs

### A. `prevNewNoteRequest` render-phase pattern drops requests that arrive before `state.phase === "ready"`
- **File**: `apps/desktop/src/workspace/WorkspaceExplorer.tsx` lines 100–107
- **Severity**: High
- **Details**: When `newNoteFocusRequest` changes, the component immediately sets `prevNewNoteRequest` to the new value. If `state.phase` is not `"ready"` at that exact render, it skips creating the input. When `state.phase` later becomes `"ready"`, the prop has not changed, so the request is silently dropped. It also calls `onNewNoteFocusHandled` during render, which is a side effect and can cause parent state updates while rendering.
- **Fix**: Use a `useEffect` (or a `pendingRequestRef`) instead. Store the latest unhandled request id; when `state.phase` becomes `"ready"` and a pending request exists, call `setCreating(...)` and `onNewNoteFocusHandled` from the effect.

### B. `confirmDelete` closes the dialog before the delete finishes
- **File**: `apps/desktop/src/workspace/WorkspaceExplorer.tsx` lines 171–179
- **Severity**: Medium
- **Details**: `setPendingDelete(null)` is called before `runWithRefresh` starts. If the delete fails, the confirmation dialog is already gone and `pendingDelete` is null, so the user cannot retry from the dialog and only sees a generic `actionError` in the tree.
- **Fix**: Make `runWithRefresh` return `Promise<boolean>` (or throw) and clear `pendingDelete` only when it resolves `true`. Keep the dialog open on failure.

### C. `submitCreate` / `submitRename` remove inline input even on error
- **File**: `apps/desktop/src/workspace/WorkspaceExplorer.tsx` lines 135–169
- **Severity**: Medium
- **Details**: Both use `.finally(() => setCreating(null) / setRenaming(null))`, so a network/filesystem error still makes the inline input disappear and the typed name is lost.
- **Fix**: Clear inline state only on success, or on explicit cancel/Escape. Use an operation id and functional updater (`setCreating(current => current?.id === target.id ? null : current)`) so a newer inline edit is not clobbered by a finishing older operation.

### D. New file/folder inside a collapsed folder does not expand it
- **File**: `apps/desktop/src/workspace/WorkspaceExplorer.tsx` lines 210–213, 347–349, 383–418
- **Severity**: Medium
- **Details**: `startCreate` sets `creating` with the folder’s `relative_path`, but `isExpanded` is local to `WorkspaceTreeItem` and defaults to `false`. If the folder is collapsed, `isCreatingHere` is false, the inline input is never rendered, and the `creating` state is left dangling.
- **Fix**: Lift expanded-folder state into `WorkspaceExplorer` (or the reducer) and expand the target folder in `startCreate`/`startRename` before opening the inline input.

### E. No validation of `/` or `\` in inline names
- **File**: `apps/desktop/src/workspace/WorkspaceExplorer.tsx` lines 135–169, 672–674
- **Severity**: Low–Medium
- **Details**: `joinPath(parent, name)` simply concatenates. Typing `sub/note.md` in the name field will create nested directories with no client-side warning. The backend accepts it because `normalize_relative_path` treats each slash-separated segment as a normal component.
- **Fix**: Reject names containing path separators before calling `submitCreate`/`submitRename` and surface a clear validation message.

---

## 4. Context menu

### Menu items do close the menu, but `event.stopPropagation()` does not block the `window` click listener
- **File**: `apps/desktop/src/workspace/WorkspaceExplorer.tsx` lines 194–208, 575–598
- **Severity**: Medium
- **Details**: `WorkspaceContextMenu` calls `event.stopPropagation()` in synthetic React handlers, but the parent’s native `window.addEventListener("click", onClose)` still fires for clicks inside the menu. Menu items work because each handler (`startCreate`, `startRename`, `requestDelete`, etc.) explicitly calls `closeContextMenu`, and the `Refresh`/`Open workspace` items call `onClose`. However the `window` listener is redundant, can fire after the action, and does not distinguish between clicking a menu item and clicking the menu backdrop.
- **Fix**: Replace the `window` click listener with a ref-based click-outside handler that only closes when the click is outside the menu element, or call `event.nativeEvent.stopImmediatePropagation()` in menu item handlers to prevent the native window listener from firing.

---

## 5. Inline edit blur

### Blur auto-submit/cancel conflicts with menu and control focus changes
- **File**: `apps/desktop/src/workspace/WorkspaceExplorer.tsx` lines 465–472 (`InlineEditRow`), 518–521 (`InlineCreateNode`), 575–598 (`WorkspaceContextMenu`)
- **Severity**: Critical
- **Details**: Both inline inputs call `onSubmit`/`onCancel` from `onBlur`. When a user opens the context menu while editing, the menu’s `firstButton?.focus()` effect (lines 563–566) or a `mousedown` on another row blurs the input first; the blur fires **before** any menu `onClick`. If the value changed, `onBlur` submits the old edit, then the menu action starts a new edit/create. Because `submitRename`/`submitCreate` clear state in `.finally(...)`, the previous operation will later call `setRenaming(null)`/`setCreating(null)` and wipe the newly-started inline input. This can cause a double rename, a spurious create, or the new rename field disappearing.
- **Fix**:
  1. Do not auto-submit on `onBlur` when `event.relatedTarget` is a menu button, dialog button, or another tree control; cancel in that case.
  2. Remove the unconditional `.finally(() => setRenaming(null) / setCreating(null))` and use a unique operation id with a functional updater so only the owning operation clears its inline state.
  3. Optionally require Enter to commit and Escape to cancel, with `onBlur` only committing when focus moves to the page body/nowhere safe.

---

## 6. Rust safety

### A. `resolve_workspace_entry_path` does not stop symlink escapes
- **File**: `apps/desktop/src-tauri/src/lib.rs` lines 728–735, 407–518 (create/rename), 524–551 (delete)
- **Severity**: Critical
- **Details**: The function normalizes `..` and joins the path to the canonical root, but it never `canonicalize`s the resolved path or verifies that the final, filesystem-resolved location is still inside the root. If a workspace contains a symlink `link -> /tmp`, then `create_workspace_file(..., "link/outside.md")` writes to `/tmp/outside.md`, `create_workspace_folder(..., "link/outside")` creates `/tmp/outside`, and `rename_workspace_entry(..., "link/outside.md")` can move files outside. `delete_workspace_entry(..., "link/subdir")` can delete a directory that resolves outside the workspace. The comment "validated to stay inside the workspace root" is therefore incorrect for symlinked paths.
- **Fix**: After resolving the literal path, `fs::canonicalize` it and `strip_prefix` / `starts_with` against the canonical root. For non-existent targets, canonicalize the deepest existing ancestor first, ensure it is inside root, then create any missing components manually (or use `openat`/`unlinkat` style APIs) so symlinks are not followed.

### B. `rename_workspace_entry` does not handle `source == destination`
- **File**: `apps/desktop/src-tauri/src/lib.rs` lines 475–518
- **Severity**: Medium
- **Details**: When `relative_path == new_relative_path`, `destination_path.exists()` is true because it is the same path, so the command returns `workspace.file_exists` instead of succeeding as a no-op.
- **Fix**: Add an early check such as `if source_path == destination_path { return workspace_entry(&root, &source_path, source_path.is_dir()); }`.

### C. `delete_workspace_entry` comment overstates path safety
- **File**: `apps/desktop/src-tauri/src/lib.rs` lines 520–551
- **Severity**: Low
- **Details**: The doc comment says "The path is validated to stay inside the workspace root, so this never escapes the root." That is only true for literal `..` / absolute traversal; symlink components are not resolved. Also `std::fs::remove_dir_all` has a documented TOCTOU race on some platforms.
- **Fix**: Resolve/canonicalize and prefix-check the entry path before deletion, and consider using platform-specific safe directory-removal crates for untrusted workspaces.

---

## 7. Type safety

### A. New `NativeCommandMap` entries are syntactically correct but have runtime gaps
- **File**: `apps/desktop/src/native/commands.ts` lines 88–117, 211–219, 264–276
- **Severity**: Medium
- **Details**: The command names, args, and result types line up with the Rust commands. Two gaps:
  1. `NativeWorkspaceEntry.kind` is typed as `"directory" | "file"`, but Rust returns an opaque `String`; there is no runtime guard that the value is one of those two literals.
  2. `invokeNativeCommand<TCommand>` declares `args?` optional for every command, so TypeScript permits calling object-argument commands without args.
- **Fix**: Add a small runtime normalizer for `WorkspaceEntry` (validate `kind`, default/fail if unexpected), and tighten the `invokeNativeCommand` signature so required object args are non-optional (e.g. conditional typing on `NativeCommandMap[TCommand]["args"]`).

### B. `delete_workspace_entry` result is typed as `null`
- **File**: `apps/desktop/src/native/commands.ts` line 111–117; `apps/desktop/src/workspace/workspaceAdapter.ts` line 27
- **Severity**: Low
- **Details**: Rust returns `()`, which Tauri usually serializes as `null`, but typing it as exactly `null` is brittle if the bridge ever returns `undefined`.
- **Fix**: Type the result as `null | undefined` or `void` and treat it as ignored in the adapter.

---

## 8. Error handling

### A. Errors are surfaced, but UI state often moves on before the user can act
- **File**: `apps/desktop/src/workspace/WorkspaceExplorer.tsx` lines 135–179, 247
- **Severity**: Medium
- **Details**: `runWithRefresh` catches errors and puts them in `actionError`, but the confirmation dialog is already closed (`confirmDelete`), and inline inputs are already removed (`submitCreate` / `submitRename`) before the user sees the error. The user must re-open the action and re-type the name to retry.
- **Fix**: Keep the inline input / confirmation dialog open until `runWithRefresh` reports success (see state-bug fixes above). Show the error inline or in the dialog instead of only in the tree-region banner.

### B. `actionError` is reset at the start of every `runWithRefresh` and persists across workspace switches
- **File**: `apps/desktop/src/workspace/WorkspaceExplorer.tsx` lines 116–117, 52–88
- **Severity**: Low–Medium
- **Details**: `setActionError(null)` at the top of `runWithRefresh` can wipe the previous operation’s error before the user reads it. `loadWorkspace` / `openWorkspace` do not reset `actionError`, so a CRUD error from a previous workspace can reappear after opening a new one.
- **Fix**: Reset `actionError` only when starting the first in-flight operation, when explicitly dismissed, or when a new workspace is successfully opened.

---

## Summary of recommended priority fixes

1. **Fix Rust symlink path containment** (`resolve_workspace_entry_path` canonicalization + prefix check).  
2. **Remove auto-submit on inline-input blur**, and clear inline state with operation ids instead of `.finally`.  
3. **Make async helpers read the latest state from a ref** and abort if the workspace changed.  
4. **Serialize or guard concurrent `runWithRefresh` calls** with an in-flight counter.  
5. **Move the `newNoteFocusRequest` handling into an effect** with a pending-request queue.  
6. **Make `runWithRefresh` return success/failure** so `confirmDelete` and inline inputs can close only on success.  
7. **Tighten runtime validation** for `NativeWorkspaceEntry.kind` and the `invokeNativeCommand` argument type.

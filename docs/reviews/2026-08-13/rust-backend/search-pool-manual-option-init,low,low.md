- name: `get_search_connection` initializes the pool with `lock.is_none()` / `as_mut().unwrap()` instead of `get_or_insert_with`
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/search.rs
- lines: 25-41
- description: `get_search_connection` (lines 25-41) does:
  ```rust
  let mut lock = SEARCH_CONNECTIONS.lock().unwrap();
  if lock.is_none() {
      *lock = Some(HashMap::new());
  }
  let pool = lock.as_mut().unwrap();
  ```
  This is the manual `Option` initialization pattern; `lock.get_or_insert_with(|| HashMap::new())` (or `get_or_insert_default()` since `HashMap` implements `Default`) collapses lines 30-33 into one expression and removes the `as_mut().unwrap()` panic surface. Same applies to the `WATCHERS` / `SelfWriteLog.expected` patterns in watcher.rs (lines 312, 338, 475) which use `get_or_insert_with` correctly already — so search.rs is inconsistent with the watcher's own idiom.

  Combined with the mutex-`unwrap` finding (separate file), this is a small verbose-pattern cleanup. The `get_or_insert_with` form is shorter AND removes a panic site (`as_mut().unwrap()`).
- verification: read search.rs:25-41; watcher.rs:312,338,475 already use `get_or_insert_with`.
- estimated savings: ~3 lines + one fewer `unwrap()` panic site.

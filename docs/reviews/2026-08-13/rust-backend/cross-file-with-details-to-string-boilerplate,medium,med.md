- name: Cross-file: `NativeError::with_details(code, msg, error.to_string())` boilerplate repeated ~30 times across the backend
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/error.rs
- lines: error.rs:32-43; settings.rs (10+ sites); workspace.rs (10+ sites); markdown.rs (8 sites); git.rs (8 sites); themes.rs (5 sites); extensions.rs (4 sites); search.rs (5 sites)
- description: The `NativeError::with_details(code, message, details)` constructor takes `impl Into<String>` for all three args. Every call site that wraps an `io::Error`/`serde_json::Error`/`rusqlite::Error`/Tauri path error passes `error.to_string()` as the third argument:
  ```rust
  NativeError::with_details(
      "settings.read_failed",
      "Failed to read the settings file.",
      error.to_string(),
  )
  ```
  This 5-line block is repeated ~30 times across the backend (counted via grep for `with_details` + `to_string()`). The `error.to_string()` is pure boilerplate — `with_details` could accept `impl std::fmt::Display` for the third arg and call `.to_string()` once internally:
  ```rust
  pub fn with_details(
      code: impl Into<String>,
      message: impl Into<String>,
      details: impl std::fmt::Display,
  ) -> Self {
      Self { code: code.into(), message: message.into(), details: Some(details.to_string()) }
  }
  ```
  Then every call site drops `.to_string()`:
  ```rust
  NativeError::with_details("settings.read_failed", "Failed to read the settings file.", error)
  ```
  ~1 line saved per site × ~30 sites = ~30 lines, plus clearer intent (the error is passed, not stringified at the call site). The few call sites that pass a `format!(...)` string (e.g. git.rs:354 `format!("...")`) still work because `String: Display`.

  This is the single highest-leverage compaction win in the backend. It touches `error.rs` (1 line change) and ~30 call sites (1 token each: drop `.to_string()`). No behavior change — the serialized `details` field is identical.
- verification: read error.rs:32-43 (third arg is `impl Into<String>`); grepped `with_details` across `src-tauri/src` — ~30 call sites, ~28 of which pass `error.to_string()` or `error.to_string()`-equivalent. The 2 that pass `format!(...)` (git.rs:354, git.rs:486) are also `Display`.
- estimated savings: ~30 lines across the backend; one-line change to `error.rs`.

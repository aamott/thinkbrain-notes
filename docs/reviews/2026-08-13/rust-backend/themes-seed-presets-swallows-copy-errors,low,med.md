- name: `seed_missing_presets` swallows copy errors via `eprintln!` — silent user-visible data loss
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/themes.rs
- lines: 154-158
- description: `seed_missing_presets` (lines 125-162) copies each missing preset from the bundled resources into the themes directory. On a copy failure (line 154-158) it logs `eprintln!("[themes] failed to copy preset {preset_file_name}: {error}")` and continues. The function then returns `Ok(())`. The frontend `list_themes` will subsequently list whatever presets *did* copy, with no indication that some are missing.

  This violates the project's "Fail loudly: return typed `Result<T, E>` errors" rule (AGENTS.md). A user who upgrades the app and expects the new preset to appear will see it silently absent. The docstring (lines 112-124) explicitly justifies this: "A failure on one preset does not abort the others" — which is a reasonable *partial-success* policy, but partial success should still be reported to the caller, not swallowed. Two options:
  - Collect the failures and include them in the return value (a `SeedResult { copied: Vec<String>, failed: Vec<String> }`), so the frontend can show "3 presets copied, 1 failed: <name>".
  - Or return the first error and let the frontend decide whether to retry the rest.

  The resource-resolution `eprintln!` at line 145 and the `!resource_path.exists()` `eprintln!` at line 149 are more defensible (dev mode without bundling), but the copy failure at line 154 is a real I/O error on a user-visible artifact.

  Low urgency because the practical failure mode is rare (disk full, permissions), but the pattern is wrong — `eprintln!` is not a substitute for a typed result.
- verification: read lines 125-162; three `eprintln!` calls (145, 149, 155) all swallow errors and continue. AGENTS.md "Fail loudly" rule.

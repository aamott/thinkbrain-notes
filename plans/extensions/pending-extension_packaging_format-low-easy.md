# Extension Packaging Format

## Goal

Define the on-disk structure of an extension and the distribution archive
format. Extensions are directories containing `extension.json` plus a JS entry
point and optional assets. Distribution uses zip archives. Development mode
loads from a local directory.

## Acceptance Criteria

- [ ] Extension directory structure is documented: `extension.json`, entry JS
      file, optional `assets/` and `themes/` subdirectories.
- [ ] Zip archive format is defined for distribution (file install and URL
      install). Zip extracts to the standard directory structure.
- [ ] Development mode loads an extension from an arbitrary local directory
      path (no zip, no install) for hot-reload-friendly development.
- [ ] Installed extensions live in `<app_data>/extensions/<id>/`.
- [ ] Unit tests cover zip extraction, directory validation, and dev-mode
      loading.

## References

- `plans/extensions/pending-extension_manifest_format-low-med.md` — manifest schema
- `apps/desktop/src-tauri` — native zip extraction and file operations

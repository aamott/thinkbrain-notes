# Extension Packaging Format

## Goal

Define the on-disk structure of a trusted local extension. Extensions are
directories containing `extension.json` plus a JS entry point and optional
assets. Development mode loads directly from a local directory first. A later
file-install package may use zip, but it must warn that the extension runs with
app privileges; URL distribution is deferred.

## Acceptance Criteria

- [ ] Extension directory structure is documented: `extension.json`, entry JS
      file, optional `assets/` and `themes/` subdirectories.
- [ ] Later file-install zip format is defined and extracts to the standard
      directory structure; URL install is explicitly out of scope for beta.
- [ ] Development mode loads an extension from an arbitrary local directory
      path (no zip, no install), with an app-privileges warning, for
      hot-reload-friendly development.
- [ ] File-installed extensions live in `<app_data>/extensions/<id>/` and retain
      the trusted-code warning.
- [ ] Unit tests cover zip extraction, directory validation, and dev-mode
      loading.

## References

- `plans/extensions/pending-extension_manifest_format-low-med.md` — manifest schema
- `apps/desktop/src-tauri` — native zip extraction and file operations

# Install from File

## Goal

Allow users to install an extension from a local file later in beta. The app
reads the package, validates its manifest and compatibility declarations, and
installs it outside the workspace. Because extensions are trusted same-context
modules, the UI must warn clearly that installed code runs with app privileges;
this is not a sandboxed install.

## Acceptance Criteria

- [ ] User can pick a local zip file and trigger install from the extensions UI.
- [ ] Zip is extracted and validated (manifest parse, compatibility-gate check)
      before activation. Packaging format is defined in the packaging format
      story.
- [ ] Install fails loudly with useful errors for invalid packages or missing
      manifests.
- [ ] Installed extension is stored outside the workspace (OS app-data area).
- [ ] UI presents and records the explicit warning that installed code runs with
      app privileges; no sandbox guarantee is made.
- [ ] Manual/E2E test: install a sample extension from file, verify warnings,
      compatibility behavior, and disposable cleanup. URL installation and
      signing are not prerequisites.

## References

- `plans/technical-decisions.md` — Extensions section (install from file)
- `apps/desktop/src-tauri` — native file pick/install bridge

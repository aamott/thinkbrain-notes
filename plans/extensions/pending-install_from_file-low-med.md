# Install from File

## Goal

Allow users to install an extension from a local file. The app reads the
extension package, validates its manifest, checks declared capabilities, and
installs it into the extension storage area (outside the workspace).

## Acceptance Criteria

- [ ] User can pick a local file and trigger install from the extensions UI.
- [ ] Selected package is validated (manifest parse, capability check) before
      activation.
- [ ] Install fails loudly with useful errors for invalid packages or missing
      manifests.
- [ ] Installed extension is stored outside the workspace (OS app-data area).
- [ ] Sandbox is enforced for the installed extension (depends on
      capability-based sandbox story).
- [ ] Manual/E2E test: install a sample extension from file and verify it loads
      with granted capabilities only.

## References

- `plans/technical-decisions.md` — Extensions section (install from file)
- `plans/archive/old-structure/architecture/extensions.md` — install from file
- `apps/desktop/src-tauri` — native file pick/install bridge

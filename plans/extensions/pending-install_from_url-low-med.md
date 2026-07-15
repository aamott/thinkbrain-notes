# Install from URL

## Goal

Allow users to install an extension from a URL. The app downloads the extension
package, validates its manifest, checks declared capabilities, and installs it
into the extension storage area (outside the workspace).

## Acceptance Criteria

- [ ] User can paste a URL and trigger install from the extensions UI.
- [ ] Downloaded package is validated (manifest parse, capability check) before
      activation.
- [ ] Install fails loudly with useful errors for bad URLs, invalid packages,
      or missing manifests.
- [ ] Installed extension is stored outside the workspace (OS app-data area).
- [ ] Sandbox is enforced for the installed extension (depends on
      capability-based sandbox story).
- [ ] Manual/E2E test: install a sample extension from URL and verify it loads
      with granted capabilities only.

## References

- `plans/technical-decisions.md` — Extensions section (install from URL)
- `apps/desktop/src-tauri` — native download/install bridge

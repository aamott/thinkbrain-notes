# Marketplace / Extension Manager UI

## Goal

A future UI for browsing, searching, inspecting, installing, updating, and
removing extensions. It is deferred beyond the trusted-local beta and may later
surface a static registry plus directly-installed extensions. It lives in the
app shell alongside the existing activity-bar panels (Explorer, Search, Source
Control).

## Acceptance Criteria

- Browse/search the cached registry index with debounced type-ahead.
- Extension detail view shows metadata, declared capabilities, compatibility
  status, version, author, and install/update/remove actions; capabilities are
  soft compatibility signals, not access controls.
- Installed extensions are listed separately with their current version and
  update state.
- Install/update/remove actions route through a future trusted-code consent and
  install mechanism; soft capability gates provide compatibility warnings, not
  access-control enforcement or sandbox guarantees.
- Errors (fetch failure, signature failure, compatibility failure) fail loudly
  with useful messages, and the UI warns that extension code has app privileges.

## References

- `plans/pending-marketplace-low-med.md`
- Prerequisite: `plans/pending-extensions-low-hard.md` (manifest, trusted local loading, lifecycle; remote install is deferred)
- UI pattern: `apps/desktop/src/search/SearchPanel.tsx`, activity bar in `App.tsx`

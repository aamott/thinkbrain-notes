# Marketplace / Extension Manager UI

## Goal

A UI for browsing, searching, inspecting, installing, updating, and removing
extensions. Surfaces the static registry plus any directly-installed
extensions. Lives in the app shell alongside the existing activity-bar panels
(Explorer, Search, Source Control).

## Acceptance Criteria

- Browse/search the cached registry index with debounced type-ahead.
- Extension detail view shows metadata, declared capabilities/permissions,
  version, author, and install/update/remove actions.
- Installed extensions are listed separately with their current version and
  update state.
- Install/update/remove actions route through the `extensions` sandbox and
  install mechanism — no bypass of capability checks.
- Errors (fetch failure, signature failure, sandbox rejection) fail loudly
  with useful messages.
- No inline styles; CSS Modules co-located with components.

## References

- `plans/pending-marketplace-low-med.md`
- Prerequisite: `plans/pending-extensions-low-hard.md` (capability sandbox, install mechanism)
- UI pattern: `apps/desktop/src/search/SearchPanel.tsx`, activity bar in `App.tsx`

# Internal Contribution Points

## Goal

Formalize the internal contribution points that built-in features use today so
they become the same surface third-party extensions will later target. Covers:
command registry, activity/sidebar panel registration, editor command hooks, and
settings schema registration.

## Acceptance Criteria

- [ ] Command registry allows registering app-owned commands with id, title,
      handler, and optional keybinding.
- [ ] Activity bar / sidebar panel registration supports built-in panels
      (Explorer, Search, Source Control, etc.) via a typed registration API.
- [ ] Editor command hooks allow built-in features to register CodeMirror 6
      commands/extensions.
- [ ] Settings schema registration lets built-in modules declare settings
      schemas consumed by the settings UI.
- [ ] All contribution points live in `packages/core` with no UI coupling;
      platform adapters in `apps/desktop` bind them to React/DOM.
- [ ] Existing built-in features are migrated to use the formalized points.
- [ ] Unit tests cover registration, lookup, and duplicate-id handling.

## References

- `plans/technical-decisions.md` — Extensions section
- `packages/core` — contribution point interfaces should live here
- `apps/desktop/src` — platform adapter bindings

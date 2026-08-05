# Internal Contribution Points

## Goal

Formalize the internal contribution points that built-in features use today so
they become the same surface trusted local extensions will later target. Relative
extension contribution ids prefer lowercase kebab-case, while the existing dotted
namespace used by full registry ids remains part of the built-in contract. The
command registry, activity/sidebar panel registration, editor command hooks, and
settings-schema bridge are implemented in the core contracts plus desktop
adapters. Remaining review items are follow-ups for future manifest and API
surfaces, not blockers for these implemented contribution points.

## Acceptance Criteria

- [x] Command registry allows registering app-owned commands with id, title,
      handler, and optional keybinding (`packages/core` contract plus desktop
      registry).
- [x] Activity bar / sidebar panel registration supports built-in panels
      (Explorer, Search, Source Control, etc.) via a typed registration API.
- [x] Editor command hooks allow built-in features to register CodeMirror 6
      commands/extensions.
- [x] Settings schema registration lets built-in modules declare settings
      schemas consumed by the settings UI through the core settings registry and
      desktop extension-scoped bridge.
- [x] All contribution points live in `packages/core` with no UI coupling;
      desktop command, panel, editor, and settings adapters bind the contracts to
      host-specific registries and state.
- [x] Existing built-in command, panel, and editor features use the formalized
      points; the settings registry and scoped bridge cover the corresponding
      settings contribution surface.
- [x] Unit tests cover core registration, lookup, ordering, and duplicate-id
      handling, with desktop panel/editor coverage.

### Follow-up review notes

- Manifest-declared settings schemas, settings UI rendering, and uninstall
  cleanup remain in the Extension Settings story; this contribution story covers
  the runtime schema bridge only.
- Future event, timer, watcher, and background-task registries should use the
  same extension-owned disposable scope as they are added. Current command,
  panel, editor-hook, and settings registrations are scoped and covered by
  lifecycle tests.
- Keep these review items as follow-ups; they do not reopen the completed
  contribution-point criteria above.

## References

- `plans/technical-decisions.md` — Extensions section
- `packages/core` — contribution point interfaces should live here
- `apps/desktop/src` — platform adapter bindings

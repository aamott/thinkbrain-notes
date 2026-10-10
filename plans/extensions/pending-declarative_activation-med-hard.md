# Story: Complete declarative contributions; drop inert activation events

`docs/reviews/2026-10-10/architecture-core-extensions-editor-med-hard.md` #3
(revisits the 2026-10-07 documented decision — a design evolution, not a
contradiction).

`onCommand:`/`onView:` are parsed but never consumed; stubs own laziness.
Meanwhile manifests can only declare commands+panels, so Settings activates
every extension just to list controls, and editor-hook/tab contributions
can't be discovered without activation.

## Acceptance

- [ ] Manifest contributions cover every stub-able/discoverable surface
      (settings schemas as pure data, tabs, editor hooks/headers).
- [ ] `onStartup` becomes a simple eager flag; `onCommand:`/`onView:` removed
      (manifest version bump + migration note).
- [ ] Settings lists extension controls without activating code.
- [ ] Decide privilege tiers in the same pass: built-ins that reach app
      stores/services (journal) labelled privileged vs public-API
      extensions; journal's reach-arounds replaced by context services or
      moved out of `builtins/` as a first-party feature.

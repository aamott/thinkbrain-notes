# Extension Manifest Format

## Goal

Define and parse the `extension.json` manifest that every extension ships. The
manifest declares id, version, display name, capabilities, contribution points,
and entry points. This is the contract the static registry and sandbox both
depend on.

## Acceptance Criteria

- [ ] `extension.json` schema is documented (id, version, name, description,
      capabilities, contributes, entry points, engines/app compatibility).
- [ ] A manifest parser validates structure and reports typed errors for
      missing/invalid fields.
- [ ] Capability declarations in the manifest are parsed into a typed
      capability list used by the sandbox.
- [ ] Contribution point declarations map to the internal contribution points
      (commands, panels, menus, editor actions, settings schemas, themes).
- [ ] Duplicate or malformed manifests fail loudly with useful diagnostics.
- [ ] Unit tests cover valid manifests, missing fields, unknown fields, and
      capability parsing.

## References

- `plans/technical-decisions.md` — Extensions section
- `packages/core` — manifest types and parser should live here

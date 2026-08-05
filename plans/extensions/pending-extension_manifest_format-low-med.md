# Extension Manifest Format

## Goal

Define and parse the `extension.json` manifest that every extension ships. The
manifest declares id, version, display name, soft capability declarations,
contribution points, and entry points. Extension ids use one canonical lowercase
kebab-case format: `[a-z][a-z0-9]*(?:-[a-z0-9]+)*`; dotted, uppercase, and
underscore forms are invalid. This is the contract the local runtime and
compatibility gates depend on; it is not a security policy.

## Acceptance Criteria

- [ ] `extension.json` schema is documented (id, version, name, description,
      capabilities, contributes, entry points, engines/app compatibility,
      activationEvents, apiVersion); `id` must match the canonical lowercase
      kebab-case rule above.
- [ ] A manifest parser validates structure and reports typed errors for
      missing/invalid fields.
- [ ] Capability declarations in the manifest are parsed into a typed list used
      for compatibility checks and platform warnings (not a sandbox).
- [ ] Contribution point declarations map to the internal contribution points
      (commands, panels, menus, context menus, editor actions, settings
      schemas, themes).
- [ ] Activation events are parsed into a typed list used by the extension
      runtime for lazy activation.
- [ ] `apiVersion` is parsed and validated against the app's supported range.
- [ ] Duplicate or malformed manifests fail loudly with useful diagnostics.
- [ ] Unit tests cover valid manifests, missing fields, unknown fields,
      capability parsing, and activation event parsing.

## References

- `plans/technical-decisions.md` — Extensions section
- `packages/core` — manifest types and parser should live here

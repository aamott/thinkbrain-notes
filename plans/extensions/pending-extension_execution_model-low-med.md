# Extension Execution Model (Superseded Rollup)

## Status

🟨 Superseded rollup; shipped scope is split across the focused stories. Manifest parsing, soft compatibility, trusted local-directory loading, and startup/command/view bootstrap are shipped. Genuine follow-ups remain: `onLanguage` activation, duplicate-id diagnostics, successful unload Blob URL cleanup, and local panel mounting.

## Goal

Record the execution boundary: trusted same-context JS modules, explicit app-privileges warning, disposable ownership, and lazy activation. This file is a rollup for older references, not a second implementation checklist.

## Discovery questions

Use the canonical lifecycle/bootstrap and local-loader stories for activation timing, module format, hot reload, failure policy, and shutdown behavior.

**Stop-and-ask gate:** Do not implement missing execution behavior in this rollup. Use the canonical focused story and obtain its product/runtime decisions first.

## Shipped prerequisites and owners

- `packages/core/src/lifecycle.ts` existing tested lifecycle.
- `done-extension_manifest_format-low-med.md` — shipped parser/schema; unsupported
  `onLanguage` remains warning-only and duplicate-id diagnostics remain outside parsing.
- `done-extension_capability_compatibility-low-med.md` — shipped soft compatibility;
  beta API grammar is `*`, exact, `^`, and `~` only.
- `done-extension_local_directory_loader-low-med.md` — shipped trusted local loader;
  local panels remain skipped and successful Blob URL revocation is still open.
- `done-extension_lifecycle_bootstrap-low-med.md` — shipped startup/command/view
  bootstrap and lifecycle cleanup.

## Exact likely file areas

Canonical implementation areas are listed in the focused stories; this rollup owns no code location.

## Rollup maintenance

1. Keep this rollup synchronized with the four shipped focused stories.
2. Route new work only to the owning follow-ups for `onLanguage`, duplicate-id
   diagnostics, Blob URL cleanup, and framework-neutral local panels.
3. Preserve trusted same-context/app-privileges wording and the soft
   capability/compatibility boundary in references.

## Acceptance criteria

- [x] No shipped manifest/compatibility/loader/bootstrap work is claimed as pending here.
- [x] Canonical focused stories are referenced by the parent epic.
- [x] Existing lifecycle tests remain attributed only to implemented behavior.
- [ ] Genuine gaps remain explicit: `onLanguage`, duplicate-id diagnostics, Blob URL
  cleanup after successful unload, and local panel mounting.

## Automated validation

Run canonical story tests and normal repository QA; no separate implementation test target.

## Manual desktop/mobile checks

Use canonical loader/bootstrap checks; confirm same webview/trusted behavior on desktop and mobile.

## Non-goals

Sandboxing, manifest parser, capability evaluator, loader, installer, marketplace, and feature behavior.

## Handoff artifacts

Status synchronization note and links to canonical stories.

## References

- `plans/extensions/done-extension_manifest_format-low-med.md`
- `plans/extensions/done-extension_capability_compatibility-low-med.md`
- `plans/extensions/done-extension_local_directory_loader-low-med.md`
- `plans/extensions/done-extension_lifecycle_bootstrap-low-med.md`
- `plans/extensions/pending-extension_contribution_surfaces-low-med.md` — local panel mount contract

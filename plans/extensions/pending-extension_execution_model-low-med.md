# Extension Execution Model (Superseded Rollup)

## Status

🟨 Partial implementation only. Existing in-memory lifecycle/disposable ownership is implemented and tested; manifest loading, compatibility, local-directory loading, lazy activation, and bootstrap are split into canonical focused stories.

## Goal

Record the execution boundary: trusted same-context JS modules, explicit app-privileges warning, disposable ownership, and lazy activation. This file is a rollup for older references, not a second implementation checklist.

## Discovery questions

Use the canonical lifecycle/bootstrap and local-loader stories for activation timing, module format, hot reload, failure policy, and shutdown behavior.

**Stop-and-ask gate:** Do not implement missing execution behavior in this rollup. Use the canonical focused story and obtain its product/runtime decisions first.

## Prerequisites

- `packages/core/src/lifecycle.ts` existing tested lifecycle.
- Canonical manifest, compatibility, loader, and bootstrap stories below.

## Exact likely file areas

Canonical implementation areas are listed in the focused stories; this rollup owns no code location.

## Implementation tasks

1. Keep this rollup synchronized with canonical story status.
2. Route new work to manifest, compatibility, local-loader, and lifecycle/bootstrap stories.
3. Preserve trusted same-context/app-privileges wording in references.

## Acceptance criteria

- [ ] No missing execution work is claimed complete here.
- [ ] Canonical focused stories are referenced by parent epic.
- [ ] Existing lifecycle tests remain attributed only to implemented behavior.

## Automated validation

Run canonical story tests and normal repository QA; no separate implementation test target.

## Manual desktop/mobile checks

Use canonical loader/bootstrap checks; confirm same webview/trusted behavior on desktop and mobile.

## Non-goals

Sandboxing, manifest parser, capability evaluator, loader, installer, marketplace, and feature behavior.

## Handoff artifacts

Status synchronization note and links to canonical stories.

## References

- `plans/extensions/pending-extension_manifest_format-low-med.md`
- `plans/extensions/pending-extension_capability_compatibility-low-med.md`
- `plans/extensions/pending-extension_local_directory_loader-low-med.md`
- `plans/extensions/pending-extension_lifecycle_bootstrap-low-med.md`

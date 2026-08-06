# Install from URL (Deferred Alias)

## Status

🚫 Explicitly deferred. The canonical deferral/reopen plan is `pending-extension_deferred_distribution-low-med.md`; no URL/registry/network install is implemented or implied.

## Goal

Keep historical references clear: HTTPS is not a trust model, and future URL installation requires separate threat-model, signing, registry, privacy, update, and consent decisions.

## Discovery questions

See the canonical deferral story for future registry, signing, mobile, privacy, moderation, update, rollback, and dependency questions.

**Stop-and-ask gate:** Do not add URL parsing, fetchers, endpoints, marketplace screens, signing stubs, or remote-install code from this alias. Reopen only after the separate product/security decision.

## Prerequisites

Stable manifest/package contracts and local file installation, plus a separate marketplace/security decision.

## Exact likely file areas

Future-only areas are listed in `pending-extension_deferred_distribution-low-med.md`; no files should be added for this alias.

## Implementation tasks

1. Keep this alias explicitly deferred.
2. Route future work to the canonical deferral story and marketplace epic.
3. Ensure local-directory/file-install stories remain independent of remote distribution.

## Acceptance criteria

- [ ] Beta exposes no URL install.
- [ ] No remote code/discovery implementation is claimed.
- [ ] Future work has a documented reopen gate.

## Automated validation

Repository search confirms no URL/registry installer symbols were introduced; normal QA remains green.

## Manual desktop/mobile checks

Extensions UI remains local-only/unavailable for URL/marketplace actions on desktop and mobile.

## Non-goals

Remote discovery/install, marketplace, signing, verification, auto-update, telemetry, moderation, dependency resolution, and remote execution.

## Handoff artifacts

Deferred decision and canonical-story link.

## References

- `plans/extensions/pending-extension_deferred_distribution-low-med.md`
- `plans/marketplace/`
- `plans/technical-decisions.md`

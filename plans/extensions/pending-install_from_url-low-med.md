# Install from URL (Deferred)

## Goal

Defer URL-based extension installation. The foreseeable beta uses trusted
built-ins and local-directory development loading; URL download, remote code
trust, signing, and marketplace distribution are intentionally not part of the
beta decision.

## Acceptance Criteria

- [x] The beta explicitly does not expose URL installation.
- [x] Documentation states that URL installation requires a future trust,
      signing, update, and remote-code review; HTTPS alone is insufficient.
- [ ] A future design may define download, package validation, user consent,
      rollback, and compatibility handling once that trust decision is made.
- [ ] URL-installed code must not be described as sandboxed unless a separate
      strong-isolation decision is approved.
- [ ] This story remains for future planning and is not a prerequisite for
      built-in or local-directory extensions.

## References

- `plans/technical-decisions.md` — Extensions section (URL install deferred)
- `apps/desktop/src-tauri` — native download/install bridge

# Capability Declarations and Compatibility Gates

## Goal

Define typed, manifest-declared capability information for trusted local
same-context extensions. Capabilities document intended access and act as
compatibility gates (including platform availability); they are not a security
sandbox or hostile-extension isolation boundary. The runtime may disable or warn
about unsupported operations, while extensions otherwise run with app
privileges.

## Acceptance Criteria

- [ ] Capability declarations are typed, documented, and parsed from the
      manifest (e.g. read-note, write-note, register-command, register-panel,
      network — exact list to be finalized).
- [ ] Capability declarations are evaluated at activation time and produce
      compatibility results for the extension and current platform.
- [ ] Unsupported or unavailable capabilities disable the affected operation or
      produce a clear warning; they are never described as adversarial
      protection.
- [ ] The manifest and UI clearly warn that trusted local/file-loaded extensions
      run with app privileges.
- [ ] Unit tests cover supported, unsupported, and platform-incompatible
      capability declarations.
- [ ] Strong iframe/process isolation, signing, and install-from-URL remain
      explicitly deferred and are not hidden acceptance criteria.

## References

- `plans/technical-decisions.md` — Extensions section (trusted same-context beta)
- `plans/pending-extensions-low-hard.md` — beta boundary and deferred isolation
- `packages/core` — capability types and compatibility-gate logic

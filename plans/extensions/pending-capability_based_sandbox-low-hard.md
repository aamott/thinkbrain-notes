# Capability-Based Sandbox

## Goal

Implement a strict, deny-by-default capability sandbox so third-party extension
code can only access capabilities declared in its manifest. V1 is strict: no
unrestricted filesystem access. This must be in place before any install-from-
URL/file story is considered done.

## Acceptance Criteria

- [ ] Sandbox enforces deny-by-default: undeclared capabilities are refused.
- [ ] Capability set is typed and documented (e.g. read-note, write-note,
      register-command, register-panel, network — exact list to be finalized).
- [ ] No capability grants unrestricted filesystem access in V1.
- [ ] Capability requests are validated against the parsed manifest at
      activation time.
- [ ] Violations fail loudly with a typed error identifying the extension and
      the denied capability.
- [ ] Unit tests cover granted access, denied access, and undeclared
      capability attempts.

## References

- `plans/technical-decisions.md` — Extensions section (V1 strict sandbox)
- `.agents/AGENTS.md` — extension permissions rule
- `plans/archive/old-structure/architecture/extensions.md` — security principle
- `packages/core` — capability types and validation logic

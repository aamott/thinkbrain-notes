# Mobile Cross-Compile Validation

Story 8. Proves the gix bet early and cheaply. No mobile UX (mobile epic).

## Scope

- CI jobs building the sync native layer (gix + rustls) for
  `aarch64-linux-android` and `aarch64-apple-ios`.
- Smoke test where feasible (emulator: init hidden repo, commit, three-way
  merge). Foreground-only constraint documented for the mobile epic.
- iCloud Drive conflict pattern noted as a future pattern-table row (iOS
  syncs via the system, not us).

## Acceptance

- [ ] Both targets compile in CI on every sync-layer change
- [ ] Failure here blocks sync-layer merges (the bet stays proven)

## Status

⬜ Pending.

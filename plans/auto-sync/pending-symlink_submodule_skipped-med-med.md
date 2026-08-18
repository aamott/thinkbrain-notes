# Symlinks and submodules never arrive

Carried from story 6b. They are skipped when the vault is brought up to date,
but they *are* in the tree that gets recorded, so the next sync sees no change
and never tries again. Silently absent on this device.

## Acceptance

- [ ] A symlink or submodule the other device sent either arrives or is
      reported as skipped, and a later sync still knows it has not landed

## Status

⬜ Pending.

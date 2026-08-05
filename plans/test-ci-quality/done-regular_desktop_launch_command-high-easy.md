# Regular Desktop Launch Command

## Goal

Provide and document a regular desktop launch path that does not depend on the
Tauri CLI development watcher's inotify allocation.

## Acceptance Criteria

- [x] Root `pnpm desktop:run` builds the frontend and starts the Tauri debug
      executable through Cargo.
- [x] README documents Node/pnpm setup, browser development, regular desktop
      launch, the host-only inotify limitation of live-reload mode, validation,
      and contribution rules.
- [x] A bounded launch smoke run confirms the regular command reaches the
      native application without restoring deleted desktop UI or CSS.

## References

- `package.json`
- `README.md`
- `apps/desktop/src-tauri/tauri.conf.json`

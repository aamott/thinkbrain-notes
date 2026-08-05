# Mobile App Scaffold

## Goal

Scaffold `apps/mobile` as a React Native app via Expo, wired into the `pnpm`
workspace. Establish the project structure, base navigation shell, and a runnable
dev build. This is the first story for the mobile epic and unblocks all others.

## Acceptance Criteria

- [ ] `apps/mobile` exists with an Expo (React Native) project setup.
- [ ] `apps/mobile` is a `pnpm` workspace member and resolves `packages/core` as
      a dependency.
- [ ] App boots on at least one target (Android emulator, iOS simulator, or Expo
      Go) showing a placeholder screen.
- [ ] Base navigation shell (stack/tab) is in place with placeholder routes.
- [ ] `pnpm lint`, `pnpm typecheck` pass for the mobile app.
- [ ] No `packages/core` imports pull in DOM, Node-only, or Tauri APIs.

## References

- `plans/pending-mobile-low-hard.md` — epic
- `plans/app-vision.md` — architecture (`apps/mobile`, `packages/core`)
- `plans/technical-decisions.md` — Platform, Repository Structure sections

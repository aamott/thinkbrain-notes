# Story: Keep NativeCommandMap in sync with Rust commands

`app_command_list!` is a solid single source on the Rust side (count-pinned
by a test), but `NativeCommandMap` in `apps/desktop/src/native/commands.ts`
is handwritten — arg/result drift fails only at runtime
(`docs/reviews/2026-10-10/architecture-native-backend-med-hard.md` #4).

## Acceptance

- [ ] CI check that every `app_command_list!` entry has a `NativeCommandMap`
      key and vice versa (cheap: a script diffing the two lists).
- [ ] Decide: generate the map via ts-rs/tauri-specta (medium) or keep the
      hand-written map + drift check (easy). Document the choice.

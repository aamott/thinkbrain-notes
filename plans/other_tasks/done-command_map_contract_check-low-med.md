# Story: Keep NativeCommandMap in sync with Rust commands

`app_command_list!` is a solid single source on the Rust side (count-pinned
by a test), but `NativeCommandMap` in `apps/desktop/src/native/commands.ts`
is handwritten — arg/result drift fails only at runtime
(`docs/reviews/2026-10-10/architecture-native-backend-med-hard.md` #4).

## Acceptance

- [x] Command-name parity: `src/native/nativeCommandContract.test.ts` checks
      every `app_command_list!` entry against the `NativeCommandMap` keys and
      vice versa, inside the existing Vitest suite (`pnpm test` / `pnpm qa`).

## Decision

Keep the handwritten typed map and check command-name parity in the existing Vitest suite. This catches missing/renamed registrations, not argument/result type drift; generation remains a separate future migration.

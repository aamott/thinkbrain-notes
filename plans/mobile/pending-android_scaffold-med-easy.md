# Story: Android Scaffold

## Goal

Run `tauri android init` to scaffold the Android target. Verify the app builds
and launches in the Android emulator. Document any Android-specific config
needed.

## Acceptance Criteria

- [ ] `tauri android dev` launches in the Android emulator.
- [ ] Basic UI renders without crash on startup.
- [ ] Android-specific config (if any) is documented.

## Known Issues

- Android keyboard / `visualViewport` issue (tauri-apps/tauri#10631) may affect
  text editing. Document as a known issue; it is tracked separately in the
  CodeMirror mobile testing story.

## References

- `plans/pending-mobile-low-hard.md` — epic context, known limitations

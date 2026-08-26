# Story: Android Scaffold

**Status:** ✅ done · **Urgency:** medium · **Difficulty:** easy

## Goal

Scaffold the Android target and verify the app builds, installs, launches and
renders on an Android device.

## Acceptance Criteria

- [x] The committed `src-tauri/gen/android/` scaffold builds and installs.
- [x] The app launches on an Android device.
- [x] Basic UI renders without crashing on startup.
- [x] Android-specific constraints are documented in the mobile epic and
      follow-up stories.

## Result

Confirmed on an Android device on 2026-08-23. Workspace opening remains blocked
by Android storage semantics and is tracked separately; it is not a scaffold
failure.

## Known Issues

- Android keyboard / `visualViewport` issue (tauri-apps/tauri#10631) may affect
  text editing. Document as a known issue; it is tracked separately in the
  CodeMirror mobile testing story.

## References

- `plans/pending-mobile-med-hard.md` — epic context, known limitations

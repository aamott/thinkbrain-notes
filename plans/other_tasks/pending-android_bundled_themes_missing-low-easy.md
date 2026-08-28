# Task: Bundled Themes Do Not Resolve on Android

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** easy

> Found in logcat while running the device clone spike, 2026-08-27
> (`../mobile/done-device_git_clone_spike-high-easy.md`). Unrelated to git;
> recorded so it is not lost.

## What happens

On app start on Android, every bundled preset fails to load:

```
I RustStdoutStderr: [themes] resource path not found for forest-dark.tbtheme.json
I RustStdoutStderr: [themes] resource path not found for forest-gray.tbtheme.json
I RustStdoutStderr: [themes] resource path not found for solarized-light.tbtheme.json
I RustStdoutStderr: [themes] resource path not found for one-dark-pro.tbtheme.json
I RustStdoutStderr: [themes] resource path not found for gruvbox-light.tbtheme.json
I RustStdoutStderr: [themes] resource path not found for nord-light.tbtheme.json
I RustStdoutStderr: [themes] resource path not found for catppuccin-latte.tbtheme.json
I RustStdoutStderr: [themes] resource path not found for pastel-pink.tbtheme.json
```

All eight presets. The Settings → Theme picker still renders and the app falls
back to a usable light theme, so this is cosmetic rather than blocking.

## Likely cause

Android packages resources inside the APK rather than on a filesystem path, so
whatever `resolve_resource`-style lookup the theme loader uses to find
`*.tbtheme.json` on desktop does not resolve there. Worth confirming the theme
loader is asking Tauri for a resource path rather than joining a directory.

## Acceptance

- [ ] Bundled themes load on Android, or the loader reports honestly that
      presets are unavailable on this platform rather than logging eight
      not-found lines
- [ ] Theme selection and switching work on a device
- [ ] Desktop theme loading unchanged

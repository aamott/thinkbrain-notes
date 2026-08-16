# Importable Themes

**Status:** in progress · **Urgency:** medium · **Difficulty:** hard

Core parsing, application, and import/export flows are implemented; strict CSS
color-value validation remains open.

## Goal

Allow users to load, apply, and export custom themes stored as single
`.tbtheme.json` files. A theme file provides a display name, a base palette
(`light` or `dark`), and a partial set of `--tn-*` token overrides. The app
applies overrides on top of the built-in base palette so themes are resilient
to UI improvements — new tokens fall back to the base automatically.

## Design Decisions

1. **Single-file format.** One `.tbtheme.json` file = one theme. Importing and
   exporting moves only that file. JSON (not CSS) so metadata (name, base) is
   parseable and the schema is validatable.

2. **Base + overrides.** A theme declares `base: "light" | "dark"` and a
   partial `tokens` map. The app sets `data-thinkbrain-theme="<base>"` as
   today, then injects a `<style>` block with the overrides layered on top.
   Tokens not in the file fall back to the base palette. This means adding new
   tokens to the app never breaks existing themes.

3. **Color tokens only (MVP).** Only `--tn-color-*` tokens are themeable in
   this story. Non-color tokens (radius, font, shadow, sizing) are structural
   and excluded. Follow-up: allow `--tn-radius-*`, `--tn-font-sans`, etc.

4. **CSS system colors are valid values.** Token values can be any valid CSS
   color string: HSL, RGB, hex, named colors, or CSS system color keywords
   (`Canvas`, `CanvasText`, `Field`, `Highlight`, `ButtonFace`, etc.). A theme
   using system colors auto-adapts to the OS light/dark preference without the
   author writing two variants.

5. **Validation mirrors the settings diagnostic pattern.** `parseThemeFile`
   returns `{ theme, diagnostics }` with typed diagnostics. Unknown tokens →
   warning (ignored, not error, so older themes load on newer apps). Malformed
   color → error. Missing required fields → error.

6. **Token allowlist lives in `packages/core`.** Core has no dependency on
   `packages/ui` (only `yaml`), so the allowlist is a constant in
   `packages/core/src/theme.ts` cross-referenced to `tokens.css`. When new
   color tokens are added there, this list is updated. Precedent:
   `designTokenNames` already lives in `packages/core/src/index.ts`.

7. **Theme file path is a setting.** `appearance.themeFile` (type `path`,
   scope `app`, `portable: false`) stores the active theme file path. The
   existing `PathControl` renders a Browse button for free. The export
   portability warning in `settingsImportExport.ts` already flags
   non-portable settings.

8. **Provider injects overrides.** `ThemeProvider` extends its effect: when
   `appearance.themeFile` is set, read the file via `readTextFileNative`,
   parse with `parseThemeFile`, and inject a `<style id="tn-custom-theme">`
   block into `<head>` scoping overrides under
   `:root[data-thinkbrain-theme="<base>"]`. On change/remove, swap or delete
   the element. The existing `data-thinkbrain-theme` switch stays intact.

9. **Import/export mirror the settings pattern.** `themeImportExport.ts`
   mirrors `settingsImportExport.ts`: `buildThemeExportPayload` (pure),
   `writeThemeExportFile` (native save dialog), `importTheme` (native open +
   read + parse + stage `appearance.themeFile`). Buttons live in the
   Appearance section, not in `SettingsSaveBar` (they're theme-specific, not
   global settings actions).

10. **No marketplace.** Deferred to `extensions` epic per the theme-foundation
    epic scope.

## Architecture

### Core (`packages/core/src/theme.ts`)

- `ThemeFile` interface: `name`, `base`, `version`, `tokens`.
- `ThemeDiagnostic` interface: `code`, `message`, `severity`, `path?`.
- `ParseThemeResult` interface: `theme`, `diagnostics`.
- `KNOWN_THEME_TOKENS`: readonly array of valid `--tn-color-*` token names.
- `parseThemeFile(rawJson)`: validates schema, token names, color values.
- `serializeThemeFile(theme)`: canonical JSON output.
- Exported from `packages/core/src/index.ts`.

### Desktop — application (`apps/desktop/src/settings/`)

- `appearanceModule` extended with `themeFile` setting (type `path`).
- `ThemeProvider.tsx` extended: reads `appearance.themeFile` effective value,
  loads + injects overrides via a helper.
- `themeInjection.ts` (new): `injectThemeOverrides(theme)` and
  `removeThemeOverrides()` manage the `<style>` element.

### Desktop — import/export (`apps/desktop/src/settings/`)

- `themeImportExport.ts` (new): mirrors `settingsImportExport.ts`.
- Export/import buttons rendered in the Appearance section of
  `SettingsContent.tsx` (or a small dedicated toolbar).

## Stories

| # | Story | Depends on |
|---|-------|------------|
| 1 | `theme-core-parser` | — |
| 2 | `theme-application` | 1 |
| 3 | `theme-import-export` | 1, 2 |

## Acceptance Criteria

- [ ] `parseThemeFile` validates name, base, version, and token entries.
- [ ] Unknown token names produce warnings (not errors) and are dropped.
- [ ] Malformed color values produce errors and cause the theme to be rejected.
- [ ] `serializeThemeFile` produces stable, pretty-printed JSON.
- [ ] `KNOWN_THEME_TOKENS` lists all 44 `--tn-color-*` tokens from
      `packages/ui/src/styles/tokens.css`.
- [ ] `appearanceModule` includes a `themeFile` path setting.
- [ ] `ThemeProvider` injects overrides when `themeFile` is set and removes
      them when cleared.
- [ ] Theme export writes a `.tbtheme.json` via native save dialog.
- [ ] Theme import reads a `.tbtheme.json`, validates, and stages the path.
- [ ] Existing settings tests updated for the new `appearance.themeFile` key.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## File References

- `packages/ui/src/styles/tokens.css` — source of truth for token names.
- `packages/core/src/settings.ts` — diagnostic pattern to mirror.
- `packages/core/src/settings/internal.ts` — `isRecord`, `getErrorMessage`.
- `packages/core/src/settings/modules/appearance.ts` — module to extend.
- `apps/desktop/src/settings/ThemeProvider.tsx` — provider to extend.
- `apps/desktop/src/settings/settingsImportExport.ts` — pattern to mirror.
- `apps/desktop/src/native/dialogs.ts` — `pickFilePath`, `saveFilePath`.
- `apps/desktop/src/native/fs.ts` — `readTextFileNative`, `writeTextFileNative`.

## Dependencies

- Modular settings system (done) — registry, store, controls, import/export.
- Native dialog + fs bridges (done) — `dialogs.ts`, `fs.ts`.

## Non-Goals

- Theme marketplace or remote theme registry (deferred to `extensions`).
- Non-color token theming (radius, font, shadow) — follow-up.
- Hot-reload of theme files via file watcher — follow-up.
- Contrast/accessibility enforcement on custom themes — follow-up.
- Per-workspace themes — themes are app-level UI preferences.

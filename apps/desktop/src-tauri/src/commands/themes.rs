//! Themes Command Module
//!
//! Discovers and lists `.tbtheme.json` theme files available to the desktop app.
//!
//! Themes live in `<app_data_dir>/themes/`. On first run (empty directory), the
//! bundled preset themes (shipped via `tauri.conf.json > bundle.resources`) are
//! copied into the directory so users immediately see a starter set. The
//! directory is then self-managed: users can drop additional `.tbtheme.json`
//! files in by hand, or import them via the settings UI.
//!
//! The `list_themes` command returns one entry per discovered file, with the
//! theme's display `name` (parsed from the JSON `name` field) and absolute
//! `path`. Files that fail to parse fall back to the filename stem so a broken
//! file is still selectable (and the frontend's parser will surface the error
//! when the user picks it).

use crate::error::{NativeError, failed};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri::path::BaseDirectory;

/// File extension for theme files (without the leading dot).
const THEME_EXTENSION: &str = "tbtheme.json";

/// Filenames of the preset themes bundled via `tauri.conf.json > bundle.resources`.
///
/// These are copied into the user's themes directory on first run. The list must
/// match the glob in `tauri.conf.json` (`presets/themes/*.tbtheme.json`).
const PRESET_THEME_FILES: &[&str] = &[
    "forest-dark.tbtheme.json",
    "forest-gray.tbtheme.json",
    "solarized-light.tbtheme.json",
    "one-dark-pro.tbtheme.json",
    "gruvbox-light.tbtheme.json",
    "nord-light.tbtheme.json",
    "catppuccin-latte.tbtheme.json",
    "pastel-pink.tbtheme.json",
];

/// One discovered theme file returned by `list_themes`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeEntry {
    /// Display name parsed from the JSON `name` field (falls back to filename stem).
    pub name: String,
    /// Absolute filesystem path to the `.tbtheme.json` file.
    pub path: String,
}

/// Lists every `.tbtheme.json` file in the user themes directory.
///
/// On first run (the directory does not exist or is empty), the bundled preset
/// themes are copied in from the app's resource directory so the picker is
/// populated immediately. Each file's `name` is parsed from its JSON `name`
/// field; if parsing fails, the filename stem is used so the file remains
/// selectable (the frontend parser will report the error when loaded).
///
/// Args:
///   app: Tauri handle used to resolve the app-data and resource directories.
///
/// Returns:
///   A vector of {@link ThemeEntry} entries, sorted by name for stable UI order.
#[tauri::command]
pub fn list_themes(app: tauri::AppHandle) -> Result<Vec<ThemeEntry>, NativeError> {
    let themes_dir = themes_dir(&app)?;
    // Ensure the directory exists, then seed presets on first run.
    ensure_themes_directory(&themes_dir)?;
    seed_missing_presets(&app, &themes_dir)?;
    // List and parse the discovered files.
    let entries = list_theme_entries(&themes_dir)?;
    Ok(entries)
}

/// Resolves the user themes directory: `<app_data_dir>/themes/`.
///
/// Args:
///   app: Tauri handle used to resolve the OS app-data directory.
///
/// Returns:
///   The absolute path to the themes directory.
pub fn themes_dir(app: &tauri::AppHandle) -> Result<PathBuf, NativeError> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        failed(
            "themes.app_data_unavailable",
            "Failed to resolve the application data directory.",
            error,
        )
    })?;
    Ok(themes_dir_path(&app_data_dir))
}

/// Computes the themes directory path under a given app-data root.
///
/// Pure helper extracted for unit testing without a Tauri handle.
pub fn themes_dir_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("themes")
}

/// Creates the themes directory if it does not already exist.
///
/// Idempotent: a no-op if the directory already exists.
pub fn ensure_themes_directory(themes_dir: &Path) -> Result<(), NativeError> {
    fs::create_dir_all(themes_dir).map_err(|error| {
        failed(
            "themes.create_dir_failed",
            "Failed to create the themes directory.",
            error,
        )
    })
}

/// Copies any missing bundled preset themes into the themes directory.
///
/// On every launch, each preset that does not already exist in the destination
/// is copied in. User edits to a preset are never overwritten (the per-file
/// `exists()` check guards this), and user-added themes are untouched. This
/// ensures new presets shipped in an app update appear without requiring the
/// user to wipe their themes directory. Missing preset resources (e.g. dev mode
/// before bundling) are logged and skipped rather than failing the whole
/// command — the picker still works, just without those presets.
///
/// Copy failures (disk full, permissions) are collected across all presets so
/// every copy is attempted, then surfaced as a typed `NativeError` listing the
/// failed filenames. Resource-resolution failures (dev mode without bundling)
/// are still logged and skipped, since they are expected in `cargo test` and
/// unbundled dev runs.
///
/// Args:
///   app: Tauri handle used to resolve bundled resource paths.
///   themes_dir: Destination directory (already created).
pub fn seed_missing_presets(app: &tauri::AppHandle, themes_dir: &Path) -> Result<(), NativeError> {
    let mut copy_failures: Vec<String> = Vec::new();
    for preset_file_name in PRESET_THEME_FILES {
        let destination = themes_dir.join(preset_file_name);
        // Never overwrite an existing file — preserves user edits to a preset
        // and user-added themes that happen to share a preset filename.
        if destination.exists() {
            continue;
        }

        // Resolve the bundled resource path. In dev mode (before bundling), the
        // resource may not exist at the bundled location; fall back to the
        // source directory so newly added presets are immediately seeded.
        let resource_path = app
            .path()
            .resolve(
                format!("presets/themes/{preset_file_name}"),
                BaseDirectory::Resource,
            )
            .ok()
            .filter(|p| p.exists())
            .or_else(|| {
                let dev_path = PathBuf::from("presets/themes").join(preset_file_name);
                if dev_path.exists() {
                    Some(dev_path)
                } else {
                    None
                }
            })
            .or_else(|| {
                let dev_path =
                    PathBuf::from("apps/desktop/src-tauri/presets/themes").join(preset_file_name);
                if dev_path.exists() {
                    Some(dev_path)
                } else {
                    None
                }
            });

        let Some(resource_path) = resource_path else {
            // Resource not found in bundle or dev sources. Skip.
            eprintln!("[themes] resource path not found for {preset_file_name}");
            continue;
        };

        // Copy the file. A failure on one preset does not abort the others, but
        // is collected and surfaced after the loop instead of swallowed.
        if let Err(error) = fs::copy(&resource_path, &destination) {
            eprintln!("[themes] failed to copy preset {preset_file_name}: {error}");
            copy_failures.push(format!("{preset_file_name}: {error}"));
        }
    }

    if copy_failures.is_empty() {
        Ok(())
    } else {
        Err(failed(
            "themes.preset_copy_failed",
            "One or more bundled preset themes could not be copied into the themes directory.",
            copy_failures.join("; "),
        ))
    }
}

/// Lists and parses every `.tbtheme.json` file in the directory.
///
/// Entries are sorted by display name for a stable, alphabetical picker order.
/// Files that fail to parse fall back to the filename stem as the display name.
pub fn list_theme_entries(themes_dir: &Path) -> Result<Vec<ThemeEntry>, NativeError> {
    let mut entries: Vec<ThemeEntry> = Vec::new();

    let dir_entries = fs::read_dir(themes_dir).map_err(|error| {
        failed(
            "themes.read_dir_failed",
            "Failed to read the themes directory.",
            error,
        )
    })?;

    for entry in dir_entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        // Skip directories and non-theme files. A directory whose name happens
        // to end with the extension would otherwise be treated as a theme file.
        if !path.is_file() || !is_theme_file(&path) {
            continue;
        }
        let name = read_theme_name(&path).unwrap_or_else(|| stem_name(&path));
        entries.push(ThemeEntry {
            name,
            path: path.to_string_lossy().into_owned(),
        });
    }

    // Sort by name for stable UI order. Case-insensitive comparison keeps
    // "Forest Dark" and "forest dark" adjacent.
    entries.sort_by_key(|a| a.name.to_lowercase());
    Ok(entries)
}

/// Reads the contents of a theme file at the given absolute path.
///
/// This bypasses the Tauri FS plugin's scope restrictions (which prevent
/// reading from the app-data directory) by using `std::fs` directly, matching
/// how `read_app_settings` reads settings files.
///
/// Args:
///   path: Absolute filesystem path to a `.tbtheme.json` file.
///
/// Returns:
///   The file contents as a string, or `None` if the file does not exist.
#[tauri::command]
pub fn read_theme_file(app: tauri::AppHandle, path: String) -> Result<Option<String>, NativeError> {
    let path = Path::new(&path);
    if !path.exists() {
        return Ok(None);
    }
    let path = resolve_theme_file_path(&themes_dir(&app)?, path)?;
    fs::read_to_string(path).map(Some).map_err(|error| {
        failed(
            "themes.read_failed",
            "Failed to read the theme file.",
            error,
        )
    })
}

/// Resolves an existing theme file and rejects paths outside the themes directory.
fn resolve_theme_file_path(themes_dir: &Path, path: &Path) -> Result<PathBuf, NativeError> {
    let canonical_themes_dir = themes_dir.canonicalize().map_err(|error| {
        failed(
            "themes.read_failed",
            "Failed to resolve the themes directory.",
            error,
        )
    })?;
    let canonical_path = path.canonicalize().map_err(|error| {
        failed(
            "themes.read_failed",
            "Failed to resolve the theme file.",
            error,
        )
    })?;

    if !canonical_path.starts_with(&canonical_themes_dir) {
        return Err(NativeError::new(
            "themes.path_outside_themes_dir",
            "Theme file path must stay inside the themes directory.",
        ));
    }

    Ok(canonical_path)
}

/// Returns true if the path has the `.tbtheme.json` extension (case-sensitive).
fn is_theme_file(path: &Path) -> bool {
    // `Path::extension` only returns the last component (`.json`), so compare
    // the full filename suffix instead.
    let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    file_name.ends_with(&format!(".{THEME_EXTENSION}"))
}

/// Parses the `name` field from a theme JSON file.
///
/// Returns `None` if the file cannot be read or the JSON does not contain a
/// string `name` field. This is a lenient parse — full validation lives in the
/// frontend `parseThemeFile` so a broken file is still listed (and selectable)
/// here, with the error surfaced when the user actually picks it.
fn read_theme_name(path: &Path) -> Option<String> {
    let contents = fs::read_to_string(path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&contents).ok()?;
    let name = parsed.get("name")?.as_str()?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Returns the filename stem (without the `.tbtheme.json` extension) as a
/// fallback display name.
fn stem_name(path: &Path) -> String {
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("theme");
    file_name
        .strip_suffix(&format!(".{THEME_EXTENSION}"))
        .unwrap_or(file_name)
        .to_string()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_test_dir(name: &str) -> PathBuf {
        crate::tests::make_temp_test_dir(name, "themes", false)
    }

    #[test]
    fn themes_dir_path_lives_under_app_data() {
        let app_data_dir = PathBuf::from("/tmp/thinkbrain-app-data");
        assert_eq!(themes_dir_path(&app_data_dir), app_data_dir.join("themes"));
    }

    #[test]
    fn ensure_themes_directory_creates_missing_dir() {
        let temp = temp_test_dir("ensure");
        let themes = temp.join("themes");

        ensure_themes_directory(&themes).expect("directory is created");

        assert!(themes.is_dir());

        // Idempotent: calling again on an existing directory is a no-op.
        ensure_themes_directory(&themes).expect("existing directory is a no-op");

        fs::remove_dir_all(temp).expect("cleanup");
    }

    #[test]
    fn list_theme_entries_returns_empty_for_empty_directory() {
        let temp = temp_test_dir("empty");
        let themes = temp.join("themes");
        fs::create_dir_all(&themes).expect("themes dir created");

        let entries = list_theme_entries(&themes).expect("listing succeeds");
        assert!(entries.is_empty());

        fs::remove_dir_all(temp).expect("cleanup");
    }

    #[test]
    fn list_theme_entries_parses_name_and_path() {
        let temp = temp_test_dir("parse");
        let themes = temp.join("themes");
        fs::create_dir_all(&themes).expect("themes dir created");

        // Write a valid theme file.
        fs::write(
            themes.join("forest-dark.tbtheme.json"),
            r#"{"name":"Forest Dark","base":"dark","version":1,"tokens":{}}"#,
        )
        .expect("theme file written");

        // Write a broken JSON file — should fall back to the filename stem.
        fs::write(themes.join("broken.tbtheme.json"), "not json").expect("broken file written");

        // Write a non-theme file — should be ignored.
        fs::write(themes.join("notes.md"), "hello").expect("non-theme file written");

        let entries = list_theme_entries(&themes).expect("listing succeeds");

        // Sorted by name: "broken" (fallback stem) < "Forest Dark".
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "broken");
        assert!(entries[0].path.ends_with("broken.tbtheme.json"));
        assert_eq!(entries[1].name, "Forest Dark");
        assert!(entries[1].path.ends_with("forest-dark.tbtheme.json"));

        fs::remove_dir_all(temp).expect("cleanup");
    }

    #[test]
    fn list_theme_entries_ignores_non_theme_json_files() {
        let temp = temp_test_dir("ignore");
        let themes = temp.join("themes");
        fs::create_dir_all(&themes).expect("themes dir created");

        // A `.json` file that is NOT a `.tbtheme.json` — must be ignored.
        fs::write(themes.join("app.json"), "{}").expect("json file written");
        // A directory whose name happens to end with the extension — must be
        // ignored (it is not a file).
        fs::create_dir_all(themes.join("weird.tbtheme.json")).expect("directory created");

        let entries = list_theme_entries(&themes).expect("listing succeeds");
        assert!(entries.is_empty());

        fs::remove_dir_all(temp).expect("cleanup");
    }

    #[test]
    fn is_theme_file_matches_tbtheme_extension() {
        assert!(is_theme_file(&PathBuf::from(
            "/tmp/themes/forest-dark.tbtheme.json"
        )));
        assert!(!is_theme_file(&PathBuf::from("/tmp/themes/app.json")));
        assert!(!is_theme_file(&PathBuf::from("/tmp/themes/notes.md")));
        assert!(!is_theme_file(&PathBuf::from(
            "/tmp/themes/forest-dark.json"
        )));
    }

    #[test]
    fn resolve_theme_file_path_rejects_traversal() {
        let temp = temp_test_dir("path-traversal");
        let themes = temp.join("themes");
        fs::create_dir_all(&themes).expect("themes dir created");
        let outside = temp.join("secret.tbtheme.json");
        fs::write(&outside, "secret").expect("outside file written");

        let error = resolve_theme_file_path(&themes, &themes.join("../secret.tbtheme.json"))
            .expect_err("traversal is rejected");

        assert_eq!(error.code, "themes.path_outside_themes_dir");
        fs::remove_dir_all(temp).expect("cleanup");
    }

    #[test]
    fn stem_name_strips_full_extension() {
        assert_eq!(
            stem_name(&PathBuf::from("/tmp/themes/forest-dark.tbtheme.json")),
            "forest-dark"
        );
        // Falls back to the full filename if the suffix is absent.
        assert_eq!(
            stem_name(&PathBuf::from("/tmp/themes/other.json")),
            "other.json"
        );
    }

    #[test]
    fn read_theme_name_returns_trimmed_name() {
        let temp = temp_test_dir("name");
        let path = temp.join("theme.tbtheme.json");
        fs::write(
            &path,
            r#"{"name":"  Spaced Theme  ","base":"dark","version":1}"#,
        )
        .expect("theme written");

        assert_eq!(read_theme_name(&path), Some("Spaced Theme".to_string()));

        fs::remove_dir_all(temp).expect("cleanup");
    }

    #[test]
    fn read_theme_name_returns_none_for_missing_or_empty_name() {
        let temp = temp_test_dir("name-missing");
        let no_name = temp.join("no-name.tbtheme.json");
        fs::write(&no_name, r#"{"base":"dark","version":1}"#).expect("written");
        let empty_name = temp.join("empty-name.tbtheme.json");
        fs::write(&empty_name, r#"{"name":"   ","base":"dark","version":1}"#).expect("written");
        let not_json = temp.join("not-json.tbtheme.json");
        fs::write(&not_json, "not json").expect("written");

        assert_eq!(read_theme_name(&no_name), None);
        assert_eq!(read_theme_name(&empty_name), None);
        assert_eq!(read_theme_name(&not_json), None);

        fs::remove_dir_all(temp).expect("cleanup");
    }
}

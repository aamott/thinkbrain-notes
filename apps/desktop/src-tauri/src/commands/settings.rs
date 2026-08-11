
use crate::error::NativeError;
use serde::Deserialize;
use std::path::{Path, PathBuf};

use std::sync::Mutex;
use std::fs;
use tauri::Manager;
use serde_json::{Map, Value};
use crate::commands::workspace::{resolve_workspace_root, stable_workspace_hash};

static APP_SETTINGS_MUTATION_LOCK: Mutex<()> = Mutex::new(());

/// Separate from the app lock: the two documents are different files, and a
/// workspace save has no reason to wait behind a theme change.
static WORKSPACE_SETTINGS_MUTATION_LOCK: Mutex<()> = Mutex::new(());
const APP_THEME_KEY: &str = "theme";
const SUPPORTED_APP_THEMES: [&str; 3] = ["system", "light", "dark"];
const DESKTOP_STATE_KEY: &str = "desktopState";
const DESKTOP_STATE_VERSION: u64 = 4;
const MAX_RECENT_WORKSPACES: usize = 12;
const MIN_PANEL_WIDTH: f64 = 224.0;
const MAX_PANEL_WIDTH: f64 = 480.0;
const DEFAULT_LEFT_PANEL_WIDTH: f64 = 288.0;
const DEFAULT_RIGHT_PANEL_WIDTH: f64 = 320.0;

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTab {
    pub id: String,
    pub title: String,
    pub kind: String,
    #[serde(default)]
    pub root_path: Option<String>,
    #[serde(default)]
    pub relative_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DesktopStateUpdate {
    #[serde(default)]
    pub last_workspace_path: Option<Option<String>>,
    #[serde(default)]
    pub recent_workspace_paths: Option<Vec<String>>,
    #[serde(default)]
    pub explorer_open: Option<bool>,
    #[serde(default)]
    pub left_panel_width: Option<f64>,
    #[serde(default)]
    pub right_panel_width: Option<f64>,
    #[serde(default)]
    pub bottom_panel_open: Option<bool>,
    #[serde(default)]
    pub development_extension_directories: Option<Vec<String>>,
    #[serde(default)]
    pub open_tabs: Option<Vec<PersistedTab>>,
    #[serde(default)]
    pub active_tab_id: Option<Option<String>>,
}


#[derive(Debug, Clone, PartialEq)]
pub struct DesktopState {
    last_workspace_path: Option<String>,
    recent_workspace_paths: Vec<String>,
    explorer_open: bool,
    left_panel_width: f64,
    right_panel_width: f64,
    bottom_panel_open: bool,
    development_extension_directories: Vec<String>,
    open_tabs: Vec<PersistedTab>,
    active_tab_id: Option<String>,
}


#[tauri::command]
pub fn read_app_settings(app: tauri::AppHandle) -> Result<Option<String>, NativeError> {
    let _settings_lock = APP_SETTINGS_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    read_settings_file(&resolve_app_settings_path(&app)?)
}


/// Refuses a write computed from a document that is no longer on disk.
///
/// The app document has three writers. `update_desktop_state` and
/// `update_app_theme` read and write inside a single locked command each, so
/// nothing can land between their read and their write and they stay correct
/// without a precondition. `write_app_settings` is different: the store reads
/// the document (`read_app_settings`) on one IPC round trip and writes it on
/// another, so a desktop-state update or a theme change — or another window's
/// save — can land in between. Carrying the document the revision was computed
/// from turns that silent loss into a refusal the caller can recompute against.
pub fn check_app_settings_precondition(
    current: Option<&str>,
    expected: Option<&str>,
) -> Result<(), NativeError> {
    check_settings_precondition(
        current,
        expected,
        "settings.app_conflict",
        "The application settings changed while this one was being saved.",
    )
}

/// The check itself, shared by both documents.
///
/// Two writers that disagree about what is on disk is one situation, not two;
/// only the name of the document differs, and that is what the code and message
/// carry.
fn check_settings_precondition(
    current: Option<&str>,
    expected: Option<&str>,
    code: &str,
    message: &str,
) -> Result<(), NativeError> {
    if current == expected {
        return Ok(());
    }

    Err(NativeError::new(code, message))
}


#[tauri::command]
pub fn write_app_settings(
    app: tauri::AppHandle,
    contents: String,
    expected: Option<String>,
) -> Result<(), NativeError> {
    let _settings_lock = APP_SETTINGS_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let settings_path = resolve_app_settings_path(&app)?;

    // Read and check under the same lock acquisition as the write: the check is
    // only worth anything if no other writer can land between it and the write
    // it guards.
    let current = read_settings_file(&settings_path)?;
    check_app_settings_precondition(current.as_deref(), expected.as_deref())?;

    write_settings_file(&settings_path, &contents)
}


/// Reads, revises, and writes `desktopState` inside one locked command, so it
/// needs no `expected` precondition: unlike `write_app_settings` there is no
/// second IPC round trip in which another writer could land. See
/// `check_app_settings_precondition` for the writer that does need one.
#[tauri::command]
pub fn update_desktop_state(
    app: tauri::AppHandle,
    update: DesktopStateUpdate,
) -> Result<String, NativeError> {
    let _settings_lock = APP_SETTINGS_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let settings_path = resolve_app_settings_path(&app)?;
    let contents =
        update_desktop_state_contents(read_settings_file(&settings_path)?.as_deref(), update)?;

    write_settings_file(&settings_path, &contents)?;
    Ok(contents)
}


/// Persists the application theme without rewriting unrelated settings.
///
/// The read-modify-write runs under `APP_SETTINGS_MUTATION_LOCK` so concurrent
/// windows cannot clobber each other's `desktopState` or editor preferences.
///
/// Args:
///   app: Tauri handle used to resolve the OS app-data settings path.
///   theme: Requested theme; must be one of `system`, `light`, or `dark`.
///
/// Returns:
///   The full serialized settings document that was written to disk.
#[tauri::command]
pub fn update_app_theme(app: tauri::AppHandle, theme: String) -> Result<String, NativeError> {
    let _settings_lock = APP_SETTINGS_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let settings_path = resolve_app_settings_path(&app)?;
    let contents = read_settings_file(&settings_path)?;
    let updated = update_app_theme_contents(contents.as_deref(), &theme)?;

    write_settings_file(&settings_path, &updated)?;
    Ok(updated)
}


#[tauri::command]
pub fn read_workspace_settings(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<Option<String>, NativeError> {
    // Deliberately unlocked. Writes land by rename, so a reader never sees a
    // half-written file, and the lock exists only to hold a write's own
    // read-check-write together. Taking it here would make one workspace's
    // write block an unrelated workspace's read for no gain.
    read_settings_file(&resolve_workspace_settings_path(&app, &root_path)?)
}


/// Refuses a write computed from a document that is no longer on disk.
///
/// The workspace file has more than one writer and none of them owns all of it,
/// so each reads, merges its own keys and writes the whole document back. Two
/// of those sequences interleaved lose whichever landed first. Carrying the
/// document the revision was computed from turns that silent loss into a
/// refusal the caller can retry against what is actually there.
pub fn check_workspace_settings_precondition(
    current: Option<&str>,
    expected: Option<&str>,
) -> Result<(), NativeError> {
    check_settings_precondition(
        current,
        expected,
        "settings.workspace_conflict",
        "The workspace settings changed while this one was being saved.",
    )
}


#[tauri::command]
pub fn write_workspace_settings(
    app: tauri::AppHandle,
    root_path: String,
    contents: String,
    expected: Option<String>,
) -> Result<(), NativeError> {
    let _settings_lock = WORKSPACE_SETTINGS_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let settings_path = resolve_workspace_settings_path(&app, &root_path)?;

    // Read and write under one lock: the check is only worth anything if no
    // other write can land between it and the write it guards.
    let current = read_settings_file(&settings_path)?;
    check_workspace_settings_precondition(current.as_deref(), expected.as_deref())?;

    write_settings_file(&settings_path, &contents)
}


pub fn resolve_app_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, NativeError> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        NativeError::with_details(
            "settings.app_data_unavailable",
            "Failed to resolve the application data directory.",
            error.to_string(),
        )
    })?;

    Ok(app_settings_path(&app_data_dir))
}


pub fn resolve_workspace_settings_path(
    app: &tauri::AppHandle,
    root_path: &str,
) -> Result<PathBuf, NativeError> {
    let canonical_root = resolve_workspace_root(root_path)?;
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        NativeError::with_details(
            "settings.app_data_unavailable",
            "Failed to resolve the application data directory.",
            error.to_string(),
        )
    })?;

    Ok(workspace_settings_path(&app_data_dir, &canonical_root))
}


pub fn app_settings_path(app_data_dir: &Path) -> PathBuf {
    settings_dir(app_data_dir).join("app.json")
}


pub fn workspace_settings_path(app_data_dir: &Path, canonical_root: &Path) -> PathBuf {
    let workspace_key = stable_workspace_hash(&canonical_root.to_string_lossy());

    settings_dir(app_data_dir).join(format!("workspace-{workspace_key:016x}.json"))
}


pub fn settings_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("settings")
}


pub fn update_desktop_state_contents(
    contents: Option<&str>,
    update: DesktopStateUpdate,
) -> Result<String, NativeError> {
    let mut app_settings = parse_app_settings_record(contents);
    let current = read_desktop_state(&app_settings);
    let next = apply_desktop_state_update(current, update);

    app_settings.insert(DESKTOP_STATE_KEY.to_string(), serialize_desktop_state(next));
    app_settings.remove("lastWorkspacePath");
    app_settings.remove("explorerOpen");

    serialize_app_settings_record(app_settings)
}


/// Replaces only the top-level `theme` field of an app-settings document.
///
/// Unknown and unrelated keys (`editor`, `desktopState`, extension settings) are
/// carried through untouched so a theme toggle never drops other preferences.
///
/// Args:
///   contents: Existing settings JSON, or `None` when the file does not exist.
///   theme: Requested theme; must be one of `system`, `light`, or `dark`.
///
/// Returns:
///   The updated settings document, or `NativeError` when `theme` is unsupported.
pub fn update_app_theme_contents(
    contents: Option<&str>,
    theme: &str,
) -> Result<String, NativeError> {
    if !SUPPORTED_APP_THEMES.contains(&theme) {
        return Err(NativeError::with_details(
            "settings.invalid_theme",
            "Theme must be one of system, light, or dark.",
            format!("Received unsupported theme \"{theme}\"."),
        ));
    }

    let mut app_settings = parse_app_settings_record(contents);
    app_settings.insert(APP_THEME_KEY.to_string(), Value::String(theme.to_string()));

    serialize_app_settings_record(app_settings)
}


/// Serializes an app-settings record using the canonical on-disk shape:
/// pretty-printed JSON terminated by a single trailing newline.
pub fn serialize_app_settings_record(
    app_settings: Map<String, Value>,
) -> Result<String, NativeError> {
    serde_json::to_string_pretty(&Value::Object(app_settings))
        .map(|contents| format!("{contents}\n"))
        .map_err(|error| {
            NativeError::with_details(
                "settings.serialize_failed",
                "Failed to serialize the application settings.",
                error.to_string(),
            )
        })
}


pub fn parse_app_settings_record(contents: Option<&str>) -> Map<String, Value> {
    contents
        .and_then(|contents| serde_json::from_str::<Value>(contents).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default()
}


pub fn read_desktop_state(app_settings: &Map<String, Value>) -> DesktopState {
    app_settings
        .get(DESKTOP_STATE_KEY)
        .and_then(Value::as_object)
        .map(read_versioned_desktop_state)
        .unwrap_or_else(|| {
            create_desktop_state(
                app_settings.get("lastWorkspacePath"),
                None,
                app_settings.get("explorerOpen"),
                None,
                None,
                None,
                None,
                None,
                None,
            )
        })
}


pub fn read_versioned_desktop_state(state: &Map<String, Value>) -> DesktopState {
    let supported_version = match state.get("version") {
        Some(Value::Number(version)) => version.as_u64().is_some_and(|version| version <= DESKTOP_STATE_VERSION),
        None => true,
        _ => false,
    };

    if !supported_version {
        return default_desktop_state();
    }

    create_desktop_state(
        state.get("lastWorkspacePath"),
        state.get("recentWorkspacePaths"),
        state.get("explorerOpen"),
        state.get("leftPanelWidth"),
        state.get("rightPanelWidth"),
        state.get("bottomPanelOpen"),
        state.get("developmentExtensionDirectories"),
        state.get("openTabs"),
        state.get("activeTabId"),
    )
}


pub fn apply_desktop_state_update(current: DesktopState, update: DesktopStateUpdate) -> DesktopState {
    let recent_path = update
        .last_workspace_path
        .as_ref()
        .and_then(|path| path.as_deref())
        .map(str::to_owned);
    let last_workspace_path = match update.last_workspace_path {
        Some(path) => path.as_deref().and_then(nonempty_workspace_path),
        None => current.last_workspace_path.clone(),
    };
    let recent_workspace_paths = match update.recent_workspace_paths {
        Some(paths) => merge_recent_workspace_paths(
            &current.recent_workspace_paths,
            normalize_workspace_paths(paths, None),
        ),
        None => promote_recent_workspace(current.recent_workspace_paths, recent_path.as_deref()),
    };

    DesktopState {
        last_workspace_path,
        recent_workspace_paths,
        explorer_open: update.explorer_open.unwrap_or(current.explorer_open),
        left_panel_width: update
            .left_panel_width
            .map(clamp_panel_width)
            .unwrap_or(current.left_panel_width),
        right_panel_width: update
            .right_panel_width
            .map(clamp_panel_width)
            .unwrap_or(current.right_panel_width),
        bottom_panel_open: update.bottom_panel_open.unwrap_or(current.bottom_panel_open),
        development_extension_directories: update
            .development_extension_directories
            .map(normalize_extension_directories)
            .unwrap_or(current.development_extension_directories),
        open_tabs: update.open_tabs.unwrap_or(current.open_tabs),
        active_tab_id: match update.active_tab_id {
            Some(id) => id.filter(|id| !id.is_empty()),
            None => current.active_tab_id,
        },
    }
}


pub fn create_desktop_state(
    last_workspace_path: Option<&Value>,
    recent_workspace_paths: Option<&Value>,
    explorer_open: Option<&Value>,
    left_panel_width: Option<&Value>,
    right_panel_width: Option<&Value>,
    bottom_panel_open: Option<&Value>,
    development_extension_directories: Option<&Value>,
    open_tabs: Option<&Value>,
    active_tab_id: Option<&Value>,
) -> DesktopState {
    let last_workspace_path = last_workspace_path
        .and_then(Value::as_str)
        .and_then(nonempty_workspace_path);
    let recent_workspace_paths = recent_workspace_paths
        .and_then(Value::as_array)
        .map(|paths| {
            normalize_workspace_paths(
                paths
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect(),
                last_workspace_path.as_deref(),
            )
        })
        .unwrap_or_else(|| promote_recent_workspace(Vec::new(), last_workspace_path.as_deref()));

    DesktopState {
        last_workspace_path,
        recent_workspace_paths,
        explorer_open: explorer_open.and_then(Value::as_bool).unwrap_or(true),
        left_panel_width: read_panel_width(left_panel_width, DEFAULT_LEFT_PANEL_WIDTH),
        right_panel_width: read_panel_width(right_panel_width, DEFAULT_RIGHT_PANEL_WIDTH),
        bottom_panel_open: bottom_panel_open.and_then(Value::as_bool).unwrap_or(false),
        development_extension_directories: development_extension_directories
            .and_then(Value::as_array)
            .map(|directories| {
                normalize_extension_directories(
                    directories
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect(),
                )
            })
            .unwrap_or_default(),
        open_tabs: read_persisted_tabs(open_tabs),
        active_tab_id: active_tab_id
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .map(str::to_owned),
    }
}


pub fn default_desktop_state() -> DesktopState {
    DesktopState {
        last_workspace_path: None,
        recent_workspace_paths: Vec::new(),
        explorer_open: true,
        left_panel_width: DEFAULT_LEFT_PANEL_WIDTH,
        right_panel_width: DEFAULT_RIGHT_PANEL_WIDTH,
        bottom_panel_open: false,
        development_extension_directories: Vec::new(),
        open_tabs: Vec::new(),
        active_tab_id: None,
    }
}


/// Deduplicates extension directories without touching the filesystem.
///
/// Unlike workspace paths these are deliberately not canonicalized: a
/// directory that is temporarily missing must stay in the stored list so the
/// user can fix it rather than silently losing the entry.
pub fn normalize_extension_directories(directories: Vec<String>) -> Vec<String> {
    let mut normalized: Vec<String> = Vec::with_capacity(directories.len());
    for directory in directories {
        if !directory.is_empty() && !normalized.contains(&directory) {
            normalized.push(directory);
        }
    }
    normalized
}


pub fn nonempty_workspace_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    resolve_workspace_root(path).map(|p| p.to_string_lossy().to_string()).ok()
}


pub fn clamp_panel_width(width: f64) -> f64 {
    width.clamp(MIN_PANEL_WIDTH, MAX_PANEL_WIDTH)
}


pub fn read_panel_width(value: Option<&Value>, fallback: f64) -> f64 {
    value
        .and_then(Value::as_f64)
        .filter(|width| width.is_finite())
        .map(clamp_panel_width)
        .unwrap_or(fallback)
}


pub fn normalize_workspace_paths(paths: Vec<String>, fallback: Option<&str>) -> Vec<String> {
    let resolved_paths: Vec<String> = paths.into_iter().filter_map(|p| nonempty_workspace_path(&p)).collect();
    let resolved_fallback = fallback.and_then(nonempty_workspace_path);
    promote_recent_workspace(resolved_paths, resolved_fallback.as_deref())
}


pub fn merge_recent_workspace_paths(current: &[String], incoming: Vec<String>) -> Vec<String> {
    let mut merged = incoming;
    merged.extend(current.iter().cloned());
    promote_recent_workspace(merged, None)
}


pub fn promote_recent_workspace(paths: Vec<String>, path: Option<&str>) -> Vec<String> {
    let mut recent = Vec::with_capacity(MAX_RECENT_WORKSPACES);
    if let Some(path) = path.filter(|path| !path.is_empty()) {
        recent.push(path.to_string());
    }

    for path in paths {
        if !path.is_empty() && !recent.contains(&path) {
            recent.push(path);
            if recent.len() == MAX_RECENT_WORKSPACES {
                break;
            }
        }
    }

    recent
}


pub fn serialize_desktop_state(state: DesktopState) -> Value {
    let mut serialized = Map::new();
    serialized.insert("version".to_string(), Value::from(DESKTOP_STATE_VERSION));
    serialized.insert(
        "lastWorkspacePath".to_string(),
        state
            .last_workspace_path
            .map(Value::String)
            .unwrap_or(Value::Null),
    );
    serialized.insert(
        "recentWorkspacePaths".to_string(),
        Value::Array(
            state
                .recent_workspace_paths
                .into_iter()
                .map(Value::String)
                .collect(),
        ),
    );
    serialized.insert("explorerOpen".to_string(), Value::Bool(state.explorer_open));
    serialized.insert("leftPanelWidth".to_string(), Value::from(state.left_panel_width));
    serialized.insert("rightPanelWidth".to_string(), Value::from(state.right_panel_width));
    serialized.insert("bottomPanelOpen".to_string(), Value::Bool(state.bottom_panel_open));
    serialized.insert(
        "developmentExtensionDirectories".to_string(),
        Value::Array(
            state
                .development_extension_directories
                .into_iter()
                .map(Value::String)
                .collect(),
        ),
    );
    serialized.insert(
        "openTabs".to_string(),
        Value::Array(state.open_tabs.into_iter().map(serialize_persisted_tab).collect()),
    );
    serialized.insert(
        "activeTabId".to_string(),
        state
            .active_tab_id
            .map(Value::String)
            .unwrap_or(Value::Null),
    );
    Value::Object(serialized)
}

fn serialize_persisted_tab(tab: PersistedTab) -> Value {
    let mut serialized = Map::new();
    serialized.insert("id".to_string(), Value::String(tab.id));
    serialized.insert("title".to_string(), Value::String(tab.title));
    serialized.insert("kind".to_string(), Value::String(tab.kind));
    if let Some(root_path) = tab.root_path {
        serialized.insert("rootPath".to_string(), Value::String(root_path));
    }
    if let Some(relative_path) = tab.relative_path {
        serialized.insert("relativePath".to_string(), Value::String(relative_path));
    }
    Value::Object(serialized)
}

fn read_persisted_tabs(value: Option<&Value>) -> Vec<PersistedTab> {
    value
        .and_then(Value::as_array)
        .map(|tabs| {
            tabs.iter()
                .filter_map(|tab| serde_json::from_value::<PersistedTab>(tab.clone()).ok())
                .filter(|tab| !tab.id.is_empty())
                .collect()
        })
        .unwrap_or_default()
}


pub fn read_settings_file(path: &Path) -> Result<Option<String>, NativeError> {
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(NativeError::with_details(
            "settings.read_failed",
            "Failed to read the settings file.",
            error.to_string(),
        )),
    }
}


pub fn write_settings_file(path: &Path, contents: &str) -> Result<(), NativeError> {
    let parent = path.parent().ok_or_else(|| {
        NativeError::new(
            "settings.invalid_path",
            "Settings file path must include a parent directory.",
        )
    })?;

    fs::create_dir_all(parent).map_err(|error| {
        NativeError::with_details(
            "settings.create_dir_failed",
            "Failed to create the settings directory.",
            error.to_string(),
        )
    })?;

    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    
    let temp_path = parent.join(format!(".{}.tmp", unique));
    fs::write(&temp_path, contents).map_err(|error| {
        NativeError::with_details(
            "settings.write_failed",
            "Failed to write to temporary settings file.",
            error.to_string(),
        )
    })?;
    
    fs::rename(&temp_path, path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        NativeError::with_details(
            "settings.write_failed",
            "Failed to rename temporary settings file.",
            error.to_string(),
        )
    })?;

    Ok(())
}


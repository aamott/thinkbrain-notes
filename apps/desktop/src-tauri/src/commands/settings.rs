
use crate::error::NativeError;
use serde::Deserialize;
use std::path::{Path, PathBuf};

use std::sync::Mutex;
use std::fs;
use tauri::Manager;
use serde_json::{Map, Value};
use crate::commands::workspace::{resolve_workspace_root, stable_workspace_hash};

static APP_SETTINGS_MUTATION_LOCK: Mutex<()> = Mutex::new(());
const DESKTOP_STATE_KEY: &str = "desktopState";
const DESKTOP_STATE_VERSION: u64 = 2;
const MAX_RECENT_WORKSPACES: usize = 12;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopStateUpdate {
    #[serde(default)]
    pub last_workspace_path: Option<Option<String>>,
    #[serde(default)]
    pub recent_workspace_paths: Option<Vec<String>>,
    #[serde(default)]
    pub explorer_open: Option<bool>,
}


#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DesktopState {
    last_workspace_path: Option<String>,
    recent_workspace_paths: Vec<String>,
    explorer_open: bool,
}


#[tauri::command]
pub fn read_app_settings(app: tauri::AppHandle) -> Result<Option<String>, NativeError> {
    let _settings_lock = APP_SETTINGS_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    read_settings_file(&resolve_app_settings_path(&app)?)
}


#[tauri::command]
pub fn write_app_settings(app: tauri::AppHandle, contents: String) -> Result<(), NativeError> {
    let _settings_lock = APP_SETTINGS_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    write_settings_file(&resolve_app_settings_path(&app)?, &contents)
}


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


#[tauri::command]
pub fn read_workspace_settings(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<Option<String>, NativeError> {
    read_settings_file(&resolve_workspace_settings_path(&app, &root_path)?)
}


#[tauri::command]
pub fn write_workspace_settings(
    app: tauri::AppHandle,
    root_path: String,
    contents: String,
) -> Result<(), NativeError> {
    write_settings_file(
        &resolve_workspace_settings_path(&app, &root_path)?,
        &contents,
    )
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
            )
        })
}


pub fn read_versioned_desktop_state(state: &Map<String, Value>) -> DesktopState {
    let supported_version = match state.get("version") {
        Some(Value::Number(version)) => version.as_u64().is_some_and(|version| {
            version == 0 || version == 1 || version == DESKTOP_STATE_VERSION
        }),
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
    }
}


pub fn create_desktop_state(
    last_workspace_path: Option<&Value>,
    recent_workspace_paths: Option<&Value>,
    explorer_open: Option<&Value>,
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
    }
}


pub fn default_desktop_state() -> DesktopState {
    DesktopState {
        last_workspace_path: None,
        recent_workspace_paths: Vec::new(),
        explorer_open: true,
    }
}


pub fn nonempty_workspace_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    resolve_workspace_root(path).map(|p| p.to_string_lossy().to_string()).ok()
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
    Value::Object(serialized)
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



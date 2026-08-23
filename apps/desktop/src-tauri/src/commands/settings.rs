use crate::error::NativeError;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::commands::workspace::{resolve_workspace_root, stable_workspace_hash};
use serde_json::{Map, Value};
use std::fs;
use std::sync::Mutex;
use tauri::Manager;

static APP_SETTINGS_MUTATION_LOCK: Mutex<()> = Mutex::new(());

/// Separate from the app lock: the two documents are different files, and a
/// workspace save has no reason to wait behind a theme change.
static WORKSPACE_SETTINGS_MUTATION_LOCK: Mutex<()> = Mutex::new(());

fn acquire_app_settings_lock() -> std::sync::MutexGuard<'static, ()> {
    APP_SETTINGS_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

const APP_THEME_KEY: &str = "theme";
const SUPPORTED_APP_THEMES: [&str; 3] = ["system", "light", "dark"];
const DESKTOP_STATE_KEY: &str = "desktopState";
const DESKTOP_STATE_VERSION: u64 = 5;
const MAX_RECENT_WORKSPACES: usize = 12;
const MIN_PANEL_WIDTH: f64 = 224.0;
const MAX_PANEL_WIDTH: f64 = 480.0;
const DEFAULT_LEFT_PANEL_WIDTH: f64 = 288.0;
const DEFAULT_RIGHT_PANEL_WIDTH: f64 = 320.0;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTab {
    pub id: String,
    pub title: String,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub root_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relative_path: Option<String>,
}

/// One view's collapsed groups, in one workspace (D53).
///
/// Targeted rather than a whole map, because two windows on two vaults write
/// this without knowing about each other: sending the entire map would make
/// each of them overwrite what the other had just recorded.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollapsedGroupsUpdate {
    pub workspace_path: String,
    pub view_id: String,
    pub collapsed: Vec<String>,
}

/// One workspace's open tabs.
///
/// Targeted for the same reason the collapsed groups are, and for a defect that
/// actually shipped: tabs were one flat list in a document every window shares,
/// so two windows on two vaults overwrote each other and then restored each
/// other's notes on the next launch. Sending the whole map would put that back.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTabsUpdate {
    pub workspace_path: String,
    pub open_tabs: Vec<PersistedTab>,
    #[serde(default)]
    pub active_tab_id: Option<String>,
}

/// What one workspace had open, as the document stores it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTabState {
    pub open_tabs: Vec<PersistedTab>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_tab_id: Option<String>,
}

/// Per-workspace open tabs. A `BTreeMap` for the same stable-serialization
/// reason as `WorkspaceViews`.
pub type WorkspaceTabs = BTreeMap<String, WorkspaceTabState>;

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
    #[serde(default)]
    pub collapsed_groups: Option<CollapsedGroupsUpdate>,
    #[serde(default)]
    pub workspace_tabs: Option<WorkspaceTabsUpdate>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopState {
    #[serde(skip_deserializing)]
    version: u64,
    last_workspace_path: Option<String>,
    recent_workspace_paths: Vec<String>,
    explorer_open: bool,
    left_panel_width: f64,
    right_panel_width: f64,
    bottom_panel_open: bool,
    development_extension_directories: Vec<String>,
    open_tabs: Vec<PersistedTab>,
    active_tab_id: Option<String>,
    /// Workspace path -> view id -> the group keys collapsed in it (D53).
    workspace_views: WorkspaceViews,
    /// Workspace path -> what that workspace had open.
    ///
    /// `open_tabs` above is the flat list this replaced. It is still read and
    /// written so a downgrade keeps working, and so an existing user's tabs
    /// survive the upgrade — see `apply_workspace_tabs`.
    workspace_tabs: WorkspaceTabs,
    /// Whatever a newer build wrote here that this one has no name for.
    ///
    /// Carried through verbatim so a downgrade costs nothing: this build reads
    /// the fields it knows, writes them back, and hands the rest along
    /// untouched for the build that understands them.
    #[serde(flatten)]
    unknown_fields: Map<String, Value>,
}

/// The keys this build writes itself; everything else in a stored document is
/// somebody else's and travels in `unknown_fields`.
const DESKTOP_STATE_KEYS: [&str; 12] = [
    "version",
    "lastWorkspacePath",
    "recentWorkspacePaths",
    "explorerOpen",
    "leftPanelWidth",
    "rightPanelWidth",
    "bottomPanelOpen",
    "developmentExtensionDirectories",
    "openTabs",
    "activeTabId",
    "workspaceViews",
    "workspaceTabs",
];

/// Per-workspace, per-view collapsed group keys.
///
/// A `BTreeMap` so the document serializes the same way twice, which keeps a
/// settings file out of a diff it did not earn.
pub type WorkspaceViews = BTreeMap<String, BTreeMap<String, Vec<String>>>;

#[tauri::command]
pub fn read_app_settings(app: tauri::AppHandle) -> Result<Option<String>, NativeError> {
    let _settings_lock = acquire_app_settings_lock();
    read_settings_file(&resolve_app_settings_path(&app)?)
}

/// The check itself, shared by both documents.
///
/// Two writers that disagree about what is on disk is one situation, not two;
/// only the name of the document differs, and that is what the code and message
/// carry.
pub(crate) fn check_settings_precondition(
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
    let _settings_lock = acquire_app_settings_lock();
    let settings_path = resolve_app_settings_path(&app)?;

    // Read and check under the same lock acquisition as the write: the check is
    // only worth anything if no other writer can land between it and the write
    // it guards.
    let current = read_settings_file(&settings_path)?;
    check_settings_precondition(
        current.as_deref(),
        expected.as_deref(),
        "settings.app_conflict",
        "The application settings changed while this one was being saved.",
    )?;

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
    let _settings_lock = acquire_app_settings_lock();
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
    let _settings_lock = acquire_app_settings_lock();
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
    check_settings_precondition(
        current.as_deref(),
        expected.as_deref(),
        "settings.workspace_conflict",
        "The workspace settings changed while this one was being saved.",
    )?;

    write_settings_file(&settings_path, &contents)
}

pub fn resolve_app_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, NativeError> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        NativeError::with_details(
            "settings.app_data_unavailable",
            "Failed to resolve the application data directory.",
            error,
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
            error,
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
                error,
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
        .unwrap_or_else(default_desktop_state)
}

/// Reads stored desktop state at whatever schema wrote it.
///
/// Every schema here is additive, so a document is readable in both directions:
/// a field an older version never wrote falls back to its default, and one a
/// newer version added is simply not read. Only a `version` that is not a
/// version at all is grounds to give up, because then nothing can be said about
/// the rest of the record. Rejecting a merely *newer* document is how running a
/// newer build and then an older one — an ordinary branch switch — used to lose
/// the workspace, the open tabs and the panel layout in one write.
pub fn read_versioned_desktop_state(state: &Map<String, Value>) -> DesktopState {
    let readable = match state.get("version") {
        Some(Value::Number(version)) => version.as_u64().is_some(),
        None => true,
        _ => false,
    };

    if !readable {
        return default_desktop_state();
    }

    create_desktop_state(state)
}

pub fn apply_desktop_state_update(
    current: DesktopState,
    update: DesktopStateUpdate,
) -> DesktopState {
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
    let workspace_views = apply_collapsed_groups(
        current.workspace_views,
        update.collapsed_groups,
        &recent_workspace_paths,
    );
    let workspace_tabs = apply_workspace_tabs(
        current.workspace_tabs,
        update.workspace_tabs,
        &recent_workspace_paths,
    );

    DesktopState {
        // Both carried from the document being updated, not reset to this
        // build's own: an update is a revision of what is there, and what is
        // there may have come from a build that knew more.
        version: current.version,
        unknown_fields: current.unknown_fields,
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
        bottom_panel_open: update
            .bottom_panel_open
            .unwrap_or(current.bottom_panel_open),
        development_extension_directories: update
            .development_extension_directories
            .map(normalize_extension_directories)
            .unwrap_or(current.development_extension_directories),
        open_tabs: update.open_tabs.unwrap_or(current.open_tabs),
        active_tab_id: match update.active_tab_id {
            Some(id) => id.filter(|id| !id.is_empty()),
            None => current.active_tab_id,
        },
        workspace_views,
        workspace_tabs,
    }
}

/// Records one view's collapsed groups and forgets the workspaces we no longer
/// remember.
///
/// The bound is the recent-workspace list rather than one of its own: a vault
/// the app has already forgotten how to reopen has no panel left to restore, so
/// tying the two together means there is one policy to reason about instead of
/// two that can disagree.
fn apply_collapsed_groups(
    mut views: WorkspaceViews,
    update: Option<CollapsedGroupsUpdate>,
    remembered: &[String],
) -> WorkspaceViews {
    // Canonicalized the way the remembered paths are, or the two spellings of a
    // symlinked vault would never match and the state would be pruned the moment
    // it was written.
    if let Some(update) = update {
        if let Some(workspace_path) = nonempty_workspace_path(&update.workspace_path) {
            views
                .entry(workspace_path)
                .or_default()
                .insert(update.view_id, update.collapsed);
        }
    }

    views.retain(|workspace_path, _| remembered.iter().any(|known| known == workspace_path));
    views
}

/// Records one workspace's open tabs and forgets the workspaces we no longer
/// remember.
///
/// Bounded by the recent-workspace list for the same reason the collapsed
/// groups are: a vault the app has forgotten how to reopen has no tabs left to
/// restore, and one policy is easier to reason about than two.
fn apply_workspace_tabs(
    mut tabs: WorkspaceTabs,
    update: Option<WorkspaceTabsUpdate>,
    remembered: &[String],
) -> WorkspaceTabs {
    if let Some(update) = update {
        if let Some(workspace_path) = nonempty_workspace_path(&update.workspace_path) {
            tabs.insert(
                workspace_path,
                WorkspaceTabState {
                    open_tabs: update.open_tabs,
                    active_tab_id: update.active_tab_id,
                },
            );
        }
    }

    tabs.retain(|workspace_path, _| remembered.iter().any(|known| known == workspace_path));
    tabs
}

pub fn create_desktop_state(state: &Map<String, Value>) -> DesktopState {
    let last_workspace_path = state
        .get("lastWorkspacePath")
        .and_then(Value::as_str)
        .and_then(nonempty_workspace_path);
    let recent_workspace_paths = state
        .get("recentWorkspacePaths")
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
        // Never stamped down. Now that the fields a newer build added travel
        // with the document, writing this build's lower version over it would
        // be the one remaining lie: it would tell that build its own document
        // had been migrated backwards and make it run the migration twice.
        version: state
            .get("version")
            .and_then(Value::as_u64)
            .unwrap_or(DESKTOP_STATE_VERSION)
            .max(DESKTOP_STATE_VERSION),
        last_workspace_path,
        recent_workspace_paths,
        explorer_open: state
            .get("explorerOpen")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        left_panel_width: read_panel_width(state.get("leftPanelWidth"), DEFAULT_LEFT_PANEL_WIDTH),
        right_panel_width: read_panel_width(
            state.get("rightPanelWidth"),
            DEFAULT_RIGHT_PANEL_WIDTH,
        ),
        bottom_panel_open: state
            .get("bottomPanelOpen")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        development_extension_directories: state
            .get("developmentExtensionDirectories")
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
        open_tabs: read_persisted_tabs(state.get("openTabs")),
        active_tab_id: state
            .get("activeTabId")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .map(str::to_owned),
        workspace_views: read_workspace_views(state.get("workspaceViews")),
        workspace_tabs: read_workspace_tabs(state.get("workspaceTabs")),
        unknown_fields: state
            .iter()
            .filter(|(key, _)| !DESKTOP_STATE_KEYS.contains(&key.as_str()))
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
    }
}

/// Reads the stored per-workspace tabs, skipping anything malformed.
///
/// Same forgiving rule as the collapsed groups: a hand-edited or truncated
/// document costs a tab that did not reopen, never a window that will not draw.
fn read_workspace_tabs(value: Option<&Value>) -> WorkspaceTabs {
    let Some(Value::Object(workspaces)) = value else {
        return WorkspaceTabs::new();
    };

    workspaces
        .iter()
        .filter_map(|(workspace_path, stored)| {
            let stored = stored.as_object()?;
            Some((
                workspace_path.clone(),
                WorkspaceTabState {
                    open_tabs: read_persisted_tabs(stored.get("openTabs")),
                    active_tab_id: stored
                        .get("activeTabId")
                        .and_then(Value::as_str)
                        .filter(|id| !id.is_empty())
                        .map(str::to_owned),
                },
            ))
        })
        .collect()
}

/// Reads the stored collapsed groups, skipping anything malformed.
///
/// A hand-edited or truncated settings file must cost the user a group that
/// reopened, never a panel that will not draw.
fn read_workspace_views(value: Option<&Value>) -> WorkspaceViews {
    let Some(Value::Object(workspaces)) = value else {
        return WorkspaceViews::new();
    };

    workspaces
        .iter()
        .filter_map(|(workspace_path, views)| {
            let views = views.as_object()?;
            Some((
                workspace_path.clone(),
                views
                    .iter()
                    .filter_map(|(view_id, collapsed)| {
                        Some((
                            view_id.clone(),
                            collapsed
                                .as_array()?
                                .iter()
                                .filter_map(Value::as_str)
                                .map(str::to_owned)
                                .collect(),
                        ))
                    })
                    .collect(),
            ))
        })
        .collect()
}

pub fn default_desktop_state() -> DesktopState {
    DesktopState {
        version: DESKTOP_STATE_VERSION,
        last_workspace_path: None,
        recent_workspace_paths: Vec::new(),
        explorer_open: true,
        left_panel_width: DEFAULT_LEFT_PANEL_WIDTH,
        right_panel_width: DEFAULT_RIGHT_PANEL_WIDTH,
        bottom_panel_open: false,
        development_extension_directories: Vec::new(),
        open_tabs: Vec::new(),
        active_tab_id: None,
        workspace_views: WorkspaceViews::new(),
        workspace_tabs: WorkspaceTabs::new(),
        unknown_fields: Map::new(),
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
    resolve_workspace_root(path)
        .map(|p| p.to_string_lossy().to_string())
        .ok()
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
    let resolved_paths: Vec<String> = paths
        .into_iter()
        .filter_map(|p| nonempty_workspace_path(&p))
        .collect();
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
    serde_json::to_value(&state)
        .expect("desktop state fields are serializable (primitives, strings, BTreeMap, Vec)")
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

/// Reads a settings document, setting aside anything unparseable first.
///
/// Every reader above this falls back to defaults when a document will not
/// parse, and the next write then replaces the file — so a document that goes
/// bad takes the workspace, the theme, the open tabs and every preference with
/// it, with nothing left to recover from. Moving it to `<stem>.corrupt.json`
/// before returning "nothing stored" costs one file and keeps the bytes.
///
/// One slot per document, overwritten: corruption that repeats must not fill
/// the disk with copies, and the newest is the one worth having. An empty file
/// is not corruption — it stored nothing — so it is read as absent and leaves
/// no quarantine behind.
pub fn read_settings_file(path: &Path) -> Result<Option<String>, NativeError> {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(NativeError::with_details(
                "settings.read_failed",
                "Failed to read the settings file.",
                error,
            ))
        }
    };

    if contents.trim().is_empty() {
        return Ok(None);
    }

    if serde_json::from_str::<Value>(&contents).is_ok() {
        return Ok(Some(contents));
    }

    quarantine_settings_file(path);
    Ok(None)
}

/// Documents set aside during this run, in the order it happened.
///
/// Kept in memory rather than found on disk: the quarantine file survives until
/// someone deals with it, and re-announcing it at every launch would nag about
/// a loss the user has already been told about. This is the announcement of an
/// event, so it lasts as long as the run the event happened in.
static QUARANTINED_SETTINGS: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Where documents were set aside during this run.
pub fn quarantined_settings_paths() -> Vec<String> {
    QUARANTINED_SETTINGS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

/// The same list, for the shell to tell the user about.
#[tauri::command]
pub fn quarantined_settings() -> Vec<String> {
    quarantined_settings_paths()
}

/// Moves an unparseable document aside, best effort.
///
/// A failure here must not stop the app from starting: the user is already
/// losing their settings, and refusing to load would turn that into a window
/// that will not open.
fn quarantine_settings_file(path: &Path) {
    let (Some(parent), Some(stem)) = (path.parent(), path.file_stem().and_then(|s| s.to_str()))
    else {
        return;
    };

    let quarantine = parent.join(format!("{stem}.corrupt.json"));
    if let Err(error) = fs::rename(path, &quarantine) {
        eprintln!("Failed to set aside unreadable settings at {path:?}: {error}");
        return;
    }

    // Recorded only once the move succeeded: telling the user their document is
    // safe at a path nothing was written to would be worse than saying nothing.
    QUARANTINED_SETTINGS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .push(quarantine.to_string_lossy().into_owned());
    eprintln!("Unreadable settings at {path:?} were set aside as {quarantine:?}.");
}

pub fn write_settings_file(path: &Path, contents: &str) -> Result<(), NativeError> {
    crate::commands::workspace::write_file_atomically(path, contents).map_err(|error| {
        NativeError::with_details(
            "settings.write_failed",
            "Failed to write the settings file.",
            error,
        )
    })
}

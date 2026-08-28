//! Bring a new notes folder in from a git link.
//!
//! The folder is app-owned only for this operation: a failure removes the
//! child we created plus this operation's settings and hidden repo, never the
//! parent. Bootstrap and the first trip reuse the existing engine primitives
//! so opening the new window cannot interleave a second merge.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::Emitter;

use crate::error::{NativeError, lock_or_recover};

use super::bootstrap::{self, hidden_repo_path};
use super::credentials::take_from_url;
use super::engine::SyncPhase;
use super::failed;
use super::push;
use super::sign_in;

/// Frontend event for one import dialog. Payload never includes the git URL.
pub const IMPORT_EVENT: &str = "sync://import";

const DEST_SETTING: &str = "sync.destination";
static NEXT_REQUEST: AtomicU64 = AtomicU64::new(1);

const RESERVED: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];
const FORBIDDEN_NAME_CHARS: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// Exact child name and destination path native code will create.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLinkPreview {
    pub child_name: String,
    pub target_path: String,
}

/// Prompt return from starting an import.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportStarted {
    pub request_id: String,
    pub target_path: String,
}

/// Progress for the matching dialog request only.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub request_id: String,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<SyncPhase>,
    pub target_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<NativeError>,
    /// Why nothing was sent back, when the import otherwise succeeded.
    ///
    /// An import fetches, merges and then pushes. The push can fail on its own
    /// — a public repository, a read-only mirror, a device with nowhere to keep
    /// a token — without any of the rest being in doubt. The vault is kept, and
    /// this says the round trip was one-way so the caller can tell the user
    /// rather than reporting a plain success.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub not_sent: Option<String>,
}

/// A finished import: where it landed, and whether it could send.
#[derive(Debug)]
pub struct Imported {
    pub path: PathBuf,
    pub landed: push::Landed,
}

/// Folder created for this operation, with the link already persisted.
#[derive(Debug)]
pub struct PreparedImport {
    pub target: PathBuf,
    pub destination: String,
    pub profile_id: Option<String>,
}

/// Cross-platform-safe child folder name from a git link or local bare path.
pub fn child_name_from_link(destination: &str) -> Result<String, NativeError> {
    let invalid = || {
        NativeError::new(
            "sync.import_name_invalid",
            "That git link does not name a usable folder.",
        )
    };
    let trimmed = destination.trim();
    if trimmed.is_empty() {
        return Err(invalid());
    }
    let path_part = path_of(trimmed);
    for segment in path_part.split(['/', '\\']) {
        if segment == "." || segment == ".." {
            return Err(invalid());
        }
    }
    let last = last_segment(trimmed).ok_or_else(invalid)?;
    let mut name = last.strip_suffix(".git").unwrap_or(last);
    name = name.trim_end_matches(['.', ' ']);
    if name.is_empty() || name == "." || name == ".." {
        return Err(invalid());
    }
    if name
        .chars()
        .any(|character| character.is_control() || FORBIDDEN_NAME_CHARS.contains(&character))
    {
        return Err(invalid());
    }
    if is_reserved(name) || name.len() > 255 {
        return Err(invalid());
    }
    Ok(name.to_string())
}

/// Canonical parent plus the derived child name — never a frontend join.
pub fn preview_from_git_link(
    destination: &str,
    parent_path: &str,
) -> Result<GitLinkPreview, NativeError> {
    let child_name = child_name_from_link(destination)?;
    let parent = resolve_parent(parent_path)?;
    let target = parent.join(&child_name);
    Ok(GitLinkPreview {
        child_name,
        target_path: target.to_string_lossy().into_owned(),
    })
}

/// Validates, creates the child folder, and persists destination + profile.
pub fn prepare_import(
    app_data: &Path,
    destination: &str,
    parent_path: &str,
    profile_id: Option<&str>,
) -> Result<PreparedImport, NativeError> {
    let preview = preview_from_git_link(destination, parent_path)?;
    let target = PathBuf::from(&preview.target_path);
    if target.exists() {
        return Err(NativeError::new(
            "sync.import_target_exists",
            "A folder with that name is already there.",
        ));
    }
    let requested = profile_id.map(str::trim).filter(|id| !id.is_empty());
    if let Some(id) = requested {
        sign_in::require_saved_profile(id, destination)?;
    }
    let destination = take_from_url(destination.trim());
    std::fs::create_dir(&target).map_err(|error| {
        failed(
            "sync.import_create_failed",
            "Could not create a new notes folder there.",
            error,
        )
    })?;
    if let Err(error) = persist_link(app_data, &target, &destination, requested) {
        let _ = std::fs::remove_dir_all(&target);
        return Err(error);
    }
    Ok(PreparedImport {
        target,
        destination,
        profile_id: requested.map(str::to_owned),
    })
}

/// Hidden-repo bootstrap and first trip. Cleans this operation's files on failure.
pub fn complete_import(
    app_data: &Path,
    prepared: PreparedImport,
    mut on_phase: impl FnMut(SyncPhase),
) -> Result<Imported, NativeError> {
    super::settle::remember_settings_home(app_data);
    let key = prepared.target.to_string_lossy().to_string();
    let lane = super::registry::lane(&key);
    let _lane = lock_or_recover(&lane);
    let result = (|| {
        on_phase(SyncPhase::Saving);
        let managed = bootstrap::bootstrap(app_data, &prepared.target)?;
        // A push that cannot be made must not undo a fetch and merge that
        // worked: importing a repository this device may never write to is a
        // normal thing to do, and rolling it back deletes the notes it just
        // brought down.
        let synced = super::round::run_trip(
            &managed.repo,
            &prepared.target,
            &prepared.destination,
            prepared.profile_id.as_deref(),
            super::round::PushPolicy::Optional,
            &mut on_phase,
        )?;
        Ok(Imported {
            path: prepared.target.clone(),
            landed: synced.landed,
        })
    })();
    if result.is_err() {
        cleanup_import(app_data, &prepared.target);
    }
    result
}

fn cleanup_import(app_data: &Path, target: &Path) {
    let settings = crate::commands::settings::workspace_settings_path(app_data, target);
    let hidden = hidden_repo_path(app_data, &target.to_string_lossy());
    if let Err(error) = std::fs::remove_file(&settings) {
        if error.kind() != std::io::ErrorKind::NotFound {
            eprintln!("[sync] import cleanup could not remove settings: {error}");
        }
    }
    if let Err(error) = std::fs::remove_dir_all(&hidden) {
        if error.kind() != std::io::ErrorKind::NotFound {
            eprintln!("[sync] import cleanup could not remove hidden history: {error}");
        }
    }
    if let Err(error) = std::fs::remove_dir_all(target) {
        if error.kind() != std::io::ErrorKind::NotFound {
            eprintln!("[sync] import cleanup could not remove the new folder: {error}");
        }
    }
}

#[tauri::command]
pub fn preview_workspace_from_git_link(
    destination: String,
    parent_path: String,
) -> Result<GitLinkPreview, NativeError> {
    preview_from_git_link(&destination, &parent_path)
}

/// Previews an import beneath the native-managed vault root.
#[tauri::command]
pub fn preview_managed_workspace_from_git_link(
    app: tauri::AppHandle,
    destination: String,
) -> Result<GitLinkPreview, NativeError> {
    let app_data = resolve_app_data(&app)?;
    let parent = crate::commands::workspace::managed_vaults_root(&app_data)?;
    preview_from_git_link(&destination, &parent.to_string_lossy())
}

#[tauri::command]
pub fn import_workspace_from_git_link(
    app: tauri::AppHandle,
    destination: String,
    parent_path: String,
    profile_id: Option<String>,
) -> Result<ImportStarted, NativeError> {
    let app_data = resolve_app_data(&app)?;
    start_import(app, app_data, destination, parent_path, profile_id, true)
}

/// Imports into the native-managed vault root and leaves opening to the current mobile window.
#[tauri::command]
pub fn import_managed_workspace_from_git_link(
    app: tauri::AppHandle,
    destination: String,
    profile_id: Option<String>,
) -> Result<ImportStarted, NativeError> {
    let app_data = resolve_app_data(&app)?;
    let parent = crate::commands::workspace::managed_vaults_root(&app_data)?;
    start_import(
        app,
        app_data,
        destination,
        parent.to_string_lossy().into_owned(),
        profile_id,
        false,
    )
}

fn resolve_app_data(app: &tauri::AppHandle) -> Result<PathBuf, NativeError> {
    use tauri::Manager as _;

    app.path().app_data_dir().map_err(|error| {
        failed(
            "sync.no_app_data",
            "Could not find where this app keeps its files.",
            error,
        )
    })
}

fn start_import(
    app: tauri::AppHandle,
    app_data: PathBuf,
    destination: String,
    parent_path: String,
    profile_id: Option<String>,
    open_in_new_window: bool,
) -> Result<ImportStarted, NativeError> {
    let prepared = prepare_import(&app_data, &destination, &parent_path, profile_id.as_deref())?;
    let request_id = new_request_id();
    let target_path = prepared.target.to_string_lossy().into_owned();
    let started = ImportStarted {
        request_id: request_id.clone(),
        target_path: target_path.clone(),
    };
    let worker_app = app.clone();
    let worker_data = app_data.clone();
    if std::thread::Builder::new()
        .name("thinkbrain-import".into())
        .spawn(move || {
            run_imported(
                worker_app,
                worker_data,
                request_id,
                target_path,
                prepared,
                open_in_new_window,
            );
        })
        .is_err()
    {
        cleanup_import(&app_data, Path::new(&started.target_path));
        return Err(NativeError::new(
            "sync.import_start_failed",
            "Could not start bringing these notes in. Try again.",
        ));
    }
    Ok(started)
}

fn run_imported(
    app: tauri::AppHandle,
    app_data: PathBuf,
    request_id: String,
    target_path: String,
    prepared: PreparedImport,
    open_in_new_window: bool,
) {
    let emit = |state: &str,
                phase: Option<SyncPhase>,
                error: Option<NativeError>,
                not_sent: Option<String>| {
        let payload = ImportProgress {
            request_id: request_id.clone(),
            state: state.to_string(),
            phase,
            target_path: target_path.clone(),
            error,
            not_sent,
        };
        if let Err(error) = app.emit(IMPORT_EVENT, payload) {
            eprintln!("[sync] failed to deliver {IMPORT_EVENT}: {error}");
        }
    };
    match complete_import(&app_data, prepared, |phase| {
        emit("running", Some(phase), None, None);
    }) {
        Ok(imported) if open_in_new_window => {
            let not_sent = not_sent_reason(&imported.landed);
            match crate::commands::workspace::create_workspace_window_off_main_thread(
                app.clone(),
                imported.path.to_string_lossy().into_owned(),
            ) {
                Ok(()) => emit("ok", None, None, not_sent),
                Err(error) => emit(
                    "failed",
                    None,
                    Some(NativeError::with_details(
                        "sync.import_window_failed",
                        "The new workspace is ready, but its window could not open.",
                        error,
                    )),
                    None,
                ),
            }
        }
        Ok(imported) => emit("ok", None, None, not_sent_reason(&imported.landed)),
        Err(error) => emit("failed", None, Some(error), None),
    }
}

/// The reason an otherwise successful import sent nothing, if it sent nothing.
fn not_sent_reason(landed: &push::Landed) -> Option<String> {
    match landed {
        push::Landed::NotSent { reason } => Some(reason.clone()),
        _ => None,
    }
}

fn persist_link(
    app_data: &Path,
    root: &Path,
    destination: &str,
    profile_id: Option<&str>,
) -> Result<(), NativeError> {
    let path = crate::commands::settings::workspace_settings_path(app_data, root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            failed(
                "settings.write_failed",
                "Could not save this folder's git link.",
                error,
            )
        })?;
    }
    let mut record = crate::commands::settings::parse_app_settings_record(None);
    record.insert(
        DEST_SETTING.to_string(),
        serde_json::Value::String(destination.to_string()),
    );
    record.insert(
        sign_in::PROFILE_SETTING.to_string(),
        serde_json::Value::String(profile_id.unwrap_or("").to_string()),
    );
    let written = crate::commands::settings::serialize_app_settings_record(record)?;
    crate::commands::settings::write_settings_file(&path, &written)
}

fn resolve_parent(parent_path: &str) -> Result<PathBuf, NativeError> {
    let parent = PathBuf::from(parent_path.trim());
    if !parent.is_absolute() {
        return Err(NativeError::new(
            "sync.import_parent_invalid",
            "Choose a folder on this computer to put the new notes folder in.",
        ));
    }
    let canonical = parent.canonicalize().map_err(|error| {
        failed(
            "sync.import_parent_invalid",
            "Could not open that parent folder.",
            error,
        )
    })?;
    if !canonical.is_dir() {
        return Err(NativeError::new(
            "sync.import_parent_invalid",
            "The place for the new notes folder must itself be a folder.",
        ));
    }
    Ok(canonical)
}

fn path_of(destination: &str) -> &str {
    if let Some((_, rest)) = destination.split_once("://") {
        let after_host = rest.split_once('/').map(|(_, path)| path).unwrap_or("");
        after_host.split(['?', '#']).next().unwrap_or(after_host)
    } else {
        destination
    }
}

fn last_segment(destination: &str) -> Option<&str> {
    let trimmed = destination.trim().trim_end_matches(['/', '\\']);
    if trimmed.contains("://") {
        trimmed
            .split(['?', '#'])
            .next()
            .unwrap_or(trimmed)
            .rsplit('/')
            .next()
            .filter(|part| !part.is_empty())
    } else {
        Path::new(trimmed).file_name()?.to_str()
    }
}

fn is_reserved(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name);
    RESERVED.contains(&stem.to_ascii_lowercase().as_str())
}

fn new_request_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos() as u64)
        .unwrap_or(0);
    let n = NEXT_REQUEST.fetch_add(1, Ordering::Relaxed);
    format!("imp{now:016x}{n:08x}")
}

#[cfg(test)]
#[path = "import_tests.rs"]
mod tests;

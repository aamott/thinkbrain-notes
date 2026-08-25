//! Keeping the version a save replaced.
//!
//! Notes are irreplaceable and a save is destructive. The atomic write means a
//! crash cannot leave half a note, but it does nothing about the save that
//! succeeded and should not have — a bad paste, a sync client's text landing in
//! a tab, an edit made against the wrong file. This is that safety net.
//!
//! **Backups live in app-data, never in the vault.** Two reasons, and the
//! second is the stronger one:
//!
//! 1. App caches do not belong in the user's folder — the vault stays notes and
//!    attachments, as `app-vision.md` requires.
//! 2. The vault is the folder the sync daemon rewrites. A backup kept there
//!    would be handed to the very process it exists to protect against, and
//!    would multiply across every device instead of standing apart. A user with
//!    the app on two or three machines instead gets that many *independent*
//!    backup sets, each on a device that can be lost separately.
//!
//! The cost is real and the recovery UI must say it plainly: a backup does not
//! travel with the vault. Restoring on a machine that never held the note finds
//! nothing there, and the hidden repo's history — which does travel — is the
//! answer instead.
//!
//! Retention is count-based. Age-based retention cannot bound disk use, and
//! app-data is the one place that has to stay bounded.

use crate::error::NativeError;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use super::workspace::{stable_workspace_hash, write_file_atomically};

/// How many replaced versions of one note are kept.
///
/// Three covers the mistake noticed a save or two later, which is when people
/// actually notice. A setting for this — and for an age bound alongside it —
/// is deferred until someone asks.
pub const KEPT_BACKUPS: usize = 3;

/// This workspace's backup root: `<app-data>/backups/workspace-<hash>`.
///
/// Keyed by the same stable hash the hidden repo and the workspace settings
/// use, so one vault means one key everywhere.
pub fn workspace_backups_dir(app_data_dir: &Path, canonical_root: &Path) -> PathBuf {
    let key = stable_workspace_hash(&canonical_root.to_string_lossy());
    app_data_dir
        .join("backups")
        .join(format!("workspace-{key:016x}"))
}

/// Where one note's versions are kept.
///
/// The note's own path is mirrored underneath, so the backup tree looks like
/// the vault and someone opening it by hand can tell what they are looking at.
/// The note's *name* becomes the folder: retention is then a listing and a
/// sort, and one note's versions can never be confused with another's.
pub fn note_backups_dir(
    app_data_dir: &Path,
    canonical_root: &Path,
    relative_path: &str,
) -> PathBuf {
    let mut dir = workspace_backups_dir(app_data_dir, canonical_root);
    for segment in relative_path.split('/').filter(|s| !s.is_empty()) {
        dir.push(segment);
    }
    dir
}

/// One note's kept versions, newest first.
///
/// Written before its consumer: the recovery UI is what offers these, and the
/// retention test is what exercises it meanwhile. Kept rather than deferred
/// because retention and listing have to agree about ordering, and one of them
/// existing without the other is how they drift.
///
/// Names are nanosecond stamps, so lexicographic order is chronological order
/// for any timestamp this program will ever write.
pub fn list_note_backups(
    app_data_dir: &Path,
    canonical_root: &Path,
    relative_path: &str,
) -> Vec<PathBuf> {
    let dir = note_backups_dir(app_data_dir, canonical_root, relative_path);
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut kept: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .collect();
    kept.sort();
    kept.reverse();
    kept
}

/// Keeps `previous` as this note's most recent backup, pruning old ones.
///
/// Best-effort by contract. A backup that cannot be written must not stop a
/// save: the user pressed save, the note is what matters, and refusing to
/// write it because a *copy* failed would turn a safety net into a new way to
/// lose work. The caller logs and carries on.
pub fn keep_previous_version(
    app_data_dir: &Path,
    canonical_root: &Path,
    relative_path: &str,
    previous: &[u8],
) -> io::Result<()> {
    let dir = note_backups_dir(app_data_dir, canonical_root, relative_path);
    fs::create_dir_all(&dir)?;

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let extension = Path::new(relative_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bak");
    write_file_atomically(&dir.join(format!("{stamp:039}.{extension}")), previous)?;

    prune(&dir, KEPT_BACKUPS);
    Ok(())
}

/// Drops all but the `keep` newest versions.
///
/// Failures are swallowed: an undeletable old backup is untidy, never unsafe,
/// and is not worth failing a save over.
fn prune(dir: &Path, keep: usize) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut kept: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .collect();
    if kept.len() <= keep {
        return;
    }
    kept.sort();
    for stale in kept.iter().take(kept.len() - keep) {
        let _ = fs::remove_file(stale);
    }
}

/// One kept version, as the recovery pane lists it.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeptVersion {
    /// Absolute path, sent back verbatim to restore this one.
    pub path: String,
    /// Milliseconds since the epoch, from the name rather than the filesystem —
    /// a copy preserves neither mtime nor birth time reliably.
    pub kept_at: u64,
    pub byte_size: u64,
}

/// This note's kept versions, newest first, for the frontend.
#[tauri::command]
pub fn list_note_versions(
    app: tauri::AppHandle,
    root_path: String,
    relative_path: String,
) -> Result<Vec<KeptVersion>, NativeError> {
    use tauri::Manager;
    let root = super::workspace::resolve_workspace_root(&root_path)?;
    let Some(app_data) = app.path().app_data_dir().ok() else {
        return Ok(Vec::new());
    };

    Ok(list_note_backups(&app_data, &root, &relative_path)
        .into_iter()
        .filter_map(|path| {
            let size = fs::metadata(&path).ok()?.len();
            let stamp: u128 = path.file_stem()?.to_str()?.parse().ok()?;
            Some(KeptVersion {
                path: path.to_string_lossy().into_owned(),
                kept_at: (stamp / 1_000_000) as u64,
                byte_size: size,
            })
        })
        .collect())
}

/// Puts a kept version back, keeping what it replaced.
#[tauri::command]
pub fn restore_note_backup(
    app: tauri::AppHandle,
    root_path: String,
    relative_path: String,
    version_path: String,
) -> Result<(), NativeError> {
    use tauri::Manager;
    let app_data = app.path().app_data_dir().map_err(|error| {
        NativeError::with_details(
            "workspace.app_data_unavailable",
            "Could not find where kept versions are stored.",
            error,
        )
    })?;
    restore_note_version(&root_path, &relative_path, &version_path, &app_data)
}

/// The restore itself, split from the command so it can be tested.
///
/// `version_path` arrives from the frontend and is therefore not trusted: it is
/// checked to be inside *this note's own* backup folder before anything is
/// read. Without that, a crafted request could write any readable file on the
/// machine into a note.
///
/// The write goes through the ordinary save path, which means the version being
/// replaced is kept in turn — a restore chosen in a panic is undoable, which is
/// what lets the confirmation be an honest question rather than a last chance.
pub fn restore_note_version(
    root_path: &str,
    relative_path: &str,
    version_path: &str,
    app_data_dir: &Path,
) -> Result<(), NativeError> {
    let root = super::workspace::resolve_workspace_root(root_path)?;
    let wanted = Path::new(version_path);
    let allowed = note_backups_dir(app_data_dir, &root, relative_path);

    let is_ours = wanted
        .canonicalize()
        .ok()
        .zip(allowed.canonicalize().ok())
        .is_some_and(|(file, dir)| file.starts_with(&dir) && file.is_file());
    if !is_ours {
        return Err(NativeError::new(
            "workspace.backup_not_found",
            "That kept version is not one of this note's.",
        ));
    }

    let contents = fs::read_to_string(wanted).map_err(|error| {
        NativeError::with_details(
            "workspace.backup_unreadable",
            "That kept version could not be read.",
            error,
        )
    })?;

    super::markdown::write_markdown_document(
        root_path,
        relative_path,
        contents,
        None,
        Some(app_data_dir),
    )?;
    Ok(())
}

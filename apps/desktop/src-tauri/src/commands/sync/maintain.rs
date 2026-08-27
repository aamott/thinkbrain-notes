//! Conservative cleanup of private undo history.
//!
//! Synced notes live on `refs/heads/main` and are never rewritten. Restore
//! points live on `refs/thinkbrain/checkpoints`, which is private to this
//! device. Maintenance may rebuild that private chain — a new root at the
//! 90-day boundary, historical files over 25 MB dropped from older restore
//! points — then delete only loose objects that nothing protected still
//! names. Missing parents are the intentional end of retained undo history.
//!
//! The 25 MB figure is a retention threshold for older private restore
//! points, not a size cap: current notes and the newest restore point stay
//! intact so undo cannot silently lose the last safety copy. Packed leftovers
//! are left alone; pack compaction is a separate piece of work.

use std::collections::BTreeSet;
use std::fs;
use std::io;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::NativeError;
use crate::commands::workspace::resolve_workspace_root;
use crate::error::lock_or_recover;

use super::failed;
use super::network::REMOTE_REF;
use super::snapshot::{self, CHECKPOINT_REF};

/// How long private restore points are kept, matching
/// `DEFAULT_CHECKPOINT_RETENTION_DAYS` in
/// `packages/core/src/settings/modules/sync.ts`.
pub const RETENTION_DAYS: u64 = 90;
/// Historical private-file threshold, matching
/// `DEFAULT_HISTORICAL_FILE_LIMIT_MB` in
/// `packages/core/src/settings/modules/sync.ts`.
pub const HISTORICAL_FILE_LIMIT_MB: u64 = 25;
const HISTORICAL_FILE_LIMIT: u64 = HISTORICAL_FILE_LIMIT_MB * 1024 * 1024;
const DAILY: Duration = Duration::from_secs(24 * 60 * 60);
const LAST_RUN: &str = "thinkbrain-last-maintain";

/// Why a restore-point tidy failed, for the window to name a next step.
pub const CLEANUP_FAILED: &str = "sync.history_cleanup_failed";

/// What one cleanup pass did to on-disk usage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cleanup {
    pub bytes_before: u64,
    pub bytes_after: u64,
    pub reclaimed: u64,
}

/// How much the hidden repository occupies on this computer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub bytes: u64,
}

/// Retention knobs. Production uses the app-wide defaults; tests pass a
/// smaller file limit so they do not have to write 25 MB fixtures.
#[derive(Debug, Clone, Copy)]
pub struct Policy {
    pub retention: Duration,
    pub historical_file_limit: u64,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            retention: Duration::from_secs(RETENTION_DAYS * 24 * 60 * 60),
            historical_file_limit: HISTORICAL_FILE_LIMIT,
        }
    }
}

fn cleanup_failed(error: impl std::fmt::Display) -> NativeError {
    failed(
        CLEANUP_FAILED,
        "Could not tidy the saved undo history on this computer.",
        error,
    )
}

/// Bytes the hidden repository currently occupies, including packs and refs.
pub fn usage(repo: &gix::Repository) -> Result<u64, NativeError> {
    dir_size(repo.git_dir()).map_err(cleanup_failed)
}

/// Whether automatic cleanup is due — at most once per day.
pub fn due(repo: &gix::Repository, now: SystemTime) -> bool {
    let Ok(raw) = fs::read_to_string(repo.git_dir().join(LAST_RUN)) else {
        return true;
    };
    let Ok(saved) = raw.trim().parse::<u64>() else {
        return true;
    };
    let last = UNIX_EPOCH + Duration::from_secs(saved);
    now.duration_since(last)
        .map(|elapsed| elapsed >= DAILY)
        .unwrap_or(true)
}

pub(super) fn mark_done(repo: &gix::Repository, now: SystemTime) -> Result<(), NativeError> {
    let seconds = now
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    fs::write(repo.git_dir().join(LAST_RUN), format!("{seconds}\n")).map_err(cleanup_failed)
}

/// Rebuilds retained private restore points, then deletes unprotected loose
/// objects. Never moves `refs/heads/main` or any remote tip.
pub fn cleanup(
    repo: &gix::Repository,
    now_seconds: i64,
    policy: &Policy,
) -> Result<Cleanup, NativeError> {
    let bytes_before = usage(repo)?;
    truncate_checkpoints(repo, now_seconds, policy)?;
    collect_loose(repo)?;
    let bytes_after = usage(repo)?;
    Ok(Cleanup {
        bytes_before,
        bytes_after,
        reclaimed: bytes_before.saturating_sub(bytes_after),
    })
}

/// Drops the private restore-point ref only, then collects what that made
/// unreachable. Notes and synced history stay.
pub fn clear_undo(repo: &gix::Repository) -> Result<Cleanup, NativeError> {
    let bytes_before = usage(repo)?;
    if let Some(found) = repo
        .try_find_reference(CHECKPOINT_REF)
        .map_err(cleanup_failed)?
    {
        found.delete().map_err(cleanup_failed)?;
    }
    collect_loose(repo)?;
    let bytes_after = usage(repo)?;
    Ok(Cleanup {
        bytes_before,
        bytes_after,
        reclaimed: bytes_before.saturating_sub(bytes_after),
    })
}

struct Held {
    tree: gix::ObjectId,
    author: gix::actor::Signature,
    committer: gix::actor::Signature,
    message: gix::bstr::BString,
    seconds: i64,
}

fn truncate_checkpoints(
    repo: &gix::Repository,
    now_seconds: i64,
    policy: &Policy,
) -> Result<(), NativeError> {
    let chain = checkpoint_chain(repo)?;
    if chain.is_empty() {
        return Ok(());
    }
    let retention = i64::try_from(policy.retention.as_secs()).unwrap_or(i64::MAX);
    let cutoff = now_seconds.saturating_sub(retention);
    let original_len = chain.len();
    let mut kept = Vec::new();
    for (index, held) in chain.into_iter().enumerate() {
        if index == 0 || held.seconds >= cutoff {
            kept.push(held);
        } else {
            break;
        }
    }
    if kept.is_empty() {
        return Ok(());
    }

    let mut trees = Vec::with_capacity(kept.len());
    for (index, held) in kept.iter().enumerate() {
        let tree = if index == 0 {
            held.tree
        } else {
            slim_tree(repo, held.tree, policy.historical_file_limit)?
        };
        trees.push(tree);
    }
    let dropped_older = kept.len() < original_len;
    let slimmed = trees
        .iter()
        .zip(kept.iter())
        .any(|(tree, held)| *tree != held.tree);
    if !dropped_older && !slimmed {
        return Ok(());
    }

    let mut parent = None;
    for (held, tree) in kept.iter().rev().zip(trees.iter().rev()) {
        parent = Some(write_commit(repo, *tree, parent, held)?);
    }
    let Some(new_tip) = parent else {
        return Ok(());
    };
    repo.reference(
        CHECKPOINT_REF,
        new_tip,
        gix::refs::transaction::PreviousValue::Any,
        "truncated private undo history",
    )
    .map_err(cleanup_failed)?;
    eprintln!("[sync] rebuilt private undo history at {new_tip}");
    Ok(())
}

fn checkpoint_chain(repo: &gix::Repository) -> Result<Vec<Held>, NativeError> {
    let mut chain = Vec::new();
    let mut next = snapshot::checkpoint_head(repo)?;
    while let Some(id) = next {
        let Ok(commit) = repo.find_commit(id) else {
            break;
        };
        let tree = commit.tree_id().map_err(cleanup_failed)?.detach();
        let author: gix::actor::Signature = commit.author().map_err(cleanup_failed)?.into();
        let committer: gix::actor::Signature = commit.committer().map_err(cleanup_failed)?.into();
        let message = commit.message_raw_sloppy().to_owned();
        let seconds = commit.time().ok().map(|time| time.seconds).unwrap_or(0);
        next = commit.parent_ids().next().map(|parent| parent.detach());
        chain.push(Held {
            tree,
            author,
            committer,
            message,
            seconds,
        });
    }
    Ok(chain)
}

fn write_commit(
    repo: &gix::Repository,
    tree: gix::ObjectId,
    parent: Option<gix::ObjectId>,
    held: &Held,
) -> Result<gix::ObjectId, NativeError> {
    Ok(repo
        .write_object(&gix::objs::Commit {
            tree,
            parents: parent.into_iter().collect(),
            author: held.author.clone(),
            committer: held.committer.clone(),
            encoding: None,
            message: held.message.clone(),
            extra_headers: Vec::new(),
        })
        .map_err(cleanup_failed)?
        .detach())
}

fn slim_tree(
    repo: &gix::Repository,
    tree: gix::ObjectId,
    limit: u64,
) -> Result<gix::ObjectId, NativeError> {
    let parsed = repo.find_tree(tree).map_err(cleanup_failed)?;
    let mut recorder = gix::traverse::tree::Recorder::default();
    parsed
        .traverse()
        .breadthfirst(&mut recorder)
        .map_err(cleanup_failed)?;
    let oversized: Vec<String> = recorder
        .records
        .iter()
        .filter(|entry| entry.mode.is_blob())
        .filter(|entry| {
            repo.find_header(entry.oid)
                .map(|header| header.size() > limit)
                .unwrap_or(false)
        })
        .filter_map(|entry| String::from_utf8(entry.filepath.to_vec()).ok())
        .collect();
    if oversized.is_empty() {
        return Ok(tree);
    }
    let mut editor = repo.edit_tree(tree).map_err(cleanup_failed)?;
    for path in oversized {
        editor.remove(path.as_str()).map_err(cleanup_failed)?;
    }
    Ok(editor.write().map_err(cleanup_failed)?.detach())
}

fn collect_loose(repo: &gix::Repository) -> Result<(), NativeError> {
    let protected = protected_objects(repo)?;
    let objects = repo.git_dir().join("objects");
    let hex_len = repo.object_hash().len_in_hex();
    let entries = match fs::read_dir(&objects) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(cleanup_failed(error)),
    };
    for entry in entries {
        let entry = entry.map_err(cleanup_failed)?;
        let name = entry.file_name();
        let prefix = name.to_string_lossy();
        if prefix.len() != 2
            || !prefix
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            continue;
        }
        let folder = entry.path();
        let files = match fs::read_dir(&folder) {
            Ok(files) => files,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(cleanup_failed(error)),
        };
        for file in files {
            let file = file.map_err(cleanup_failed)?;
            let rest = file.file_name().to_string_lossy().into_owned();
            if rest.len() != hex_len.saturating_sub(2)
                || !rest.chars().all(|character| character.is_ascii_hexdigit())
            {
                continue;
            }
            let hex = format!("{prefix}{rest}");
            let Ok(id) = gix::ObjectId::from_hex(hex.as_bytes()) else {
                continue;
            };
            if protected.contains(&id) {
                continue;
            }
            fs::remove_file(file.path()).map_err(cleanup_failed)?;
            eprintln!("[sync] deleted unprotected loose object {id}");
        }
    }
    Ok(())
}

fn protected_objects(repo: &gix::Repository) -> Result<BTreeSet<gix::ObjectId>, NativeError> {
    let mut seen = BTreeSet::new();
    let mut stack = Vec::new();
    if let Some(main) = snapshot::head_commit(repo)? {
        stack.push(main);
    }
    if let Some(remote) = snapshot::try_head_of(repo, REMOTE_REF).map_err(cleanup_failed)? {
        stack.push(remote);
    }
    if let Some(checkpoints) = snapshot::checkpoint_head(repo)? {
        stack.push(checkpoints);
    }
    if let (Some(ours), Some(theirs)) = (
        snapshot::head_commit(repo)?,
        snapshot::try_head_of(repo, REMOTE_REF).map_err(cleanup_failed)?,
    ) {
        if let Ok(base) = repo.merge_base(ours, theirs) {
            stack.push(base.detach());
        }
    }
    while let Some(id) = stack.pop() {
        if !seen.insert(id) {
            continue;
        }
        let Ok(header) = repo.find_header(id) else {
            continue;
        };
        match header.kind() {
            gix::objs::Kind::Commit => {
                let Ok(commit) = repo.find_commit(id) else {
                    continue;
                };
                if let Ok(tree) = commit.tree_id() {
                    stack.push(tree.detach());
                }
                stack.extend(commit.parent_ids().map(|parent| parent.detach()));
            }
            gix::objs::Kind::Tree => {
                let Ok(tree) = repo.find_tree(id) else {
                    continue;
                };
                for entry in tree.iter() {
                    let Ok(entry) = entry else {
                        continue;
                    };
                    stack.push(entry.object_id());
                }
            }
            gix::objs::Kind::Blob | gix::objs::Kind::Tag => {}
        }
    }
    Ok(seen)
}

fn dir_size(path: &Path) -> io::Result<u64> {
    let mut total = 0;
    let mut pending = vec![path.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
        };
        for entry in entries {
            let entry = entry?;
            let metadata = match fs::symlink_metadata(entry.path()) {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error),
            };
            if metadata.is_dir() {
                pending.push(entry.path());
            } else if metadata.is_file() {
                total += metadata.len();
            }
        }
    }
    Ok(total)
}

fn engine_for(
    root_path: &str,
) -> Result<Option<std::sync::Arc<super::engine::Engine>>, NativeError> {
    let root = resolve_workspace_root(root_path)?;
    Ok(super::registry::engine(&root.to_string_lossy()))
}

fn with_locked_engine<T>(
    root_path: &str,
    work: impl FnOnce(&super::engine::Engine) -> Result<T, NativeError>,
) -> Result<T, NativeError> {
    let root = resolve_workspace_root(root_path)?;
    let key = root.to_string_lossy().to_string();
    let engine = engine_for(root_path)?.ok_or_else(|| {
        NativeError::new(
            "sync.not_recording",
            "Auto Sync is not keeping history for this workspace, so there is nothing to tidy.",
        )
    })?;
    let lane = super::registry::lane(&key);
    let _lane = lock_or_recover(&lane);
    work(&engine)
}

#[tauri::command]
pub fn sync_history_usage(root_path: String) -> Result<Usage, NativeError> {
    let Some(engine) = engine_for(&root_path)? else {
        return Ok(Usage { bytes: 0 });
    };
    Ok(Usage {
        bytes: usage(&engine.repository())?,
    })
}

#[tauri::command]
pub fn sync_free_space(root_path: String) -> Result<Cleanup, NativeError> {
    with_locked_engine(&root_path, |engine| engine.maintain(true))
}

#[tauri::command]
pub fn sync_clear_undo_history(root_path: String) -> Result<Cleanup, NativeError> {
    with_locked_engine(&root_path, |engine| engine.clear_undo())
}

#[cfg(test)]
#[path = "maintain_tests.rs"]
mod tests;

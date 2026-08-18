//! Bringing a workspace under Auto Sync, or deciding not to.
//!
//! Opening a vault for the first time has to work the same whether it is empty,
//! full of notes the user has kept for years, or already a git repository of
//! their own. The last case is the one that matters most: a vault with its own
//! `.git` belongs to its owner, and the right behaviour is to notice and stay
//! out of the way.

use std::path::{Path, PathBuf};

use crate::commands::workspace::{is_ignored_entry_name, stable_workspace_hash, MAX_WORKSPACE_ENTRIES};
use crate::NativeError;

use super::{hidden_repo, snapshot};

/// A vault Auto Sync keeps history for.
pub struct ManagedWorkspace {
    pub repo: gix::Repository,
    /// Whether this open was the one that recorded the vault for the first
    /// time.
    ///
    /// Reported rather than inferred because the difference is invisible from
    /// the outside — a repeat snapshot produces no commit, since nothing
    /// changed — but it is the difference between reading one note and reading
    /// ten thousand. The status surface also has something honest to say on a
    /// first open, where the wait is real.
    #[allow(dead_code, reason = "story 5's status surface is the reader")]
    pub took_first_snapshot: bool,
}

/// Whether Auto Sync keeps history for a vault.
pub enum Managed {
    /// Auto Sync keeps this vault's history.
    Yes(Box<ManagedWorkspace>),
    /// The vault is already a git repository of the user's own. Auto Sync does
    /// not open it, commit to it, or write near it — the settings page says so,
    /// and that is the whole of the interaction.
    HasOwnGit,
}

/// Names Auto Sync never records, in `.gitignore` syntax.
///
/// Two kinds, and the distinction is deliberate. OS bookkeeping is noise the
/// user did not create and cannot read. Temp and partial files are worse than
/// noise: a half-written file recorded as a version is a version that restores
/// to garbage.
///
/// Conflict copies left by sync daemons are **not** here. They look like junk
/// and are not: recording both sides of a conflict before touching either is
/// what makes resolution undoable.
const NEVER_RECORD: [&str; 6] = [
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
    "*.tmp",
    "~$*",
    ".~lock*",
];

/// Maximum depth for recursive vault walking. Mirrors the markdown walker's
/// own limit (which is private there), so a vault walks the same depth whether
/// it is being listed or snapshotted.
const MAX_MARKDOWN_DEPTH: usize = 20;

/// Where a vault's hidden repository lives.
///
/// Keyed by the same stable hash the workspace settings file uses, so one
/// workspace's app-data all sorts together and a moved vault gets a fresh
/// history rather than inheriting a stranger's.
pub fn hidden_repo_path(app_data_dir: &Path, canonical_root: &str) -> PathBuf {
    let key = stable_workspace_hash(canonical_root);
    app_data_dir.join("sync").join(format!("workspace-{key:016x}.git"))
}

/// Opens or creates the hidden repository for `vault`, taking the first
/// snapshot if there is nothing recorded yet.
pub fn bootstrap(app_data_dir: &Path, vault: &Path) -> Result<Managed, NativeError> {
    if vault.join(".git").exists() {
        return Ok(Managed::HasOwnGit);
    }

    let git_dir = hidden_repo_path(app_data_dir, &vault.to_string_lossy());
    let repo = hidden_repo::open_or_create(&git_dir, vault)?;
    write_exclude_file(&git_dir)?;

    let took_first_snapshot = snapshot::head_commit(&repo)?.is_none();
    if took_first_snapshot {
        let notes: Vec<PathBuf> = recordable_notes(vault)?
            .into_iter()
            .filter(|note| !super::conflict::is_conflict_copy(vault, note))
            .collect();
        if !notes.is_empty() {
            snapshot::record(&repo, &notes, "Sync — first snapshot of this workspace")?;
        }
    }

    Ok(Managed::Yes(Box::new(ManagedWorkspace {
        repo,
        took_first_snapshot,
    })))
}

/// Writes the ignore rules into the repository rather than the vault.
///
/// A `.gitignore` would be a file in the user's notes folder that they did not
/// create, that every sync daemon would then replicate to their other devices.
/// `info/exclude` is the same rules, kept where the rest of the repository is.
fn write_exclude_file(git_dir: &Path) -> Result<(), NativeError> {
    let info = git_dir.join("info");
    std::fs::create_dir_all(&info).map_err(|error| {
        NativeError::with_details(
            "sync.exclude_write_failed",
            "Could not set up this workspace's sync history.",
            error.to_string(),
        )
    })?;

    let mut contents =
        String::from("# Written by ThinkBrain Notes. Files Auto Sync never records.\n");
    for pattern in NEVER_RECORD {
        contents.push_str(pattern);
        contents.push('\n');
    }

    std::fs::write(info.join("exclude"), contents).map_err(|error| {
        NativeError::with_details(
            "sync.exclude_write_failed",
            "Could not set up this workspace's sync history.",
            error.to_string(),
        )
    })
}

/// Every file in the vault worth recording, as vault-relative paths.
pub fn recordable_notes(vault: &Path) -> Result<Vec<PathBuf>, NativeError> {
    let mut found = Vec::new();
    collect(vault, vault, 0, &mut found)?;
    found.sort();
    Ok(found)
}

fn collect(vault: &Path, directory: &Path, depth: usize, found: &mut Vec<PathBuf>) -> Result<(), NativeError> {
    if depth > MAX_MARKDOWN_DEPTH {
        return Err(NativeError::new(
            "sync.vault_too_deep",
            "This workspace's folders are nested deeper than Auto Sync can safely walk.",
        ));
    }

    let entries = std::fs::read_dir(directory).map_err(|error| {
        NativeError::with_details(
            "sync.vault_read_failed",
            "Could not read this workspace's notes.",
            error.to_string(),
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            NativeError::with_details(
                "sync.vault_read_failed",
                "Could not read this workspace's notes.",
                error.to_string(),
            )
        })?;
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();

        if is_never_recorded(&name) || is_ignored_entry_name(&name) {
            continue;
        }

        // Symlinks are not followed: a link pointing outside the vault would
        // pull unrelated files into history, and one pointing back inside it
        // would record the same note twice.
        let metadata = entry.metadata().map_err(|error| {
            NativeError::with_details(
                "sync.vault_read_failed",
                "Could not read this workspace's notes.",
                error.to_string(),
            )
        })?;

        if metadata.is_dir() {
            collect(vault, &path, depth + 1, found)?;
        } else if metadata.is_file() {
            if let Ok(relative) = path.strip_prefix(vault) {
                found.push(relative.to_path_buf());
                // Counted as each note is taken, not once per folder: a vault
                // that keeps everything in one folder would otherwise be
                // checked exactly once, while it was still empty.
                if found.len() > MAX_WORKSPACE_ENTRIES {
                    return Err(NativeError::new(
                        "sync.vault_too_many_entries",
                        "This workspace has more notes than Auto Sync can record in one snapshot.",
                    ));
                }
            }
        }
    }

    Ok(())
}

/// Matches a file name against [`NEVER_RECORD`].
///
/// Only the two wildcard shapes the list actually uses — a leading `*` and a
/// trailing `*`. A full glob engine here would be code with no caller.
pub(crate) fn is_never_recorded(name: &str) -> bool {
    NEVER_RECORD.iter().any(|pattern| match pattern.strip_prefix('*') {
        Some(suffix) => name.ends_with(suffix),
        None => match pattern.strip_suffix('*') {
            Some(prefix) => name.starts_with(prefix),
            None => name == *pattern,
        },
    })
}

#[cfg(test)]
#[path = "bootstrap_tests.rs"]
mod tests;

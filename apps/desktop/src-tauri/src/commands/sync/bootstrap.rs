//! Bringing a workspace under Auto Sync, or deciding not to.
//!
//! Opening a vault for the first time has to work the same whether it is empty,
//! full of notes the user has kept for years, or already a git repository of
//! their own. The last case used to be refused outright, which turned out to
//! confuse two different things: never touching someone's own repository, and
//! declining to keep any history for their notes. The first is right and comes
//! for free — our repository lives in app data and the walk skips every
//! dot-directory, `.git` included — while the second cost the whole feature to
//! the people most likely to have a notes folder under version control.
//! So a vault with its own `.git` is recorded like any other, and told so.

use std::path::{Path, PathBuf};

use crate::NativeError;
use crate::commands::workspace::{
    MAX_WORKSPACE_ENTRIES, is_ignored_entry_name, stable_workspace_hash,
};

use super::failed;
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
    /// Whether the vault is also a git repository of the user's own.
    ///
    /// Carried so a window can say so. It changes nothing about what we do:
    /// our repository is elsewhere, and their `.git` is a dot-directory, which
    /// the walk already skips along with every other.
    pub has_own_git: bool,
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

fn vault_read(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.vault_read_failed",
        "Could not read this workspace's notes.",
        error,
    )
}

fn exclude_write_failed(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.exclude_write_failed",
        "Could not set up this workspace's sync history.",
        error,
    )
}

/// Where a vault's hidden repository lives.
///
/// Keyed by the same stable hash the workspace settings file uses, so one
/// workspace's app-data all sorts together and a moved vault gets a fresh
/// history rather than inheriting a stranger's.
pub fn hidden_repo_path(app_data_dir: &Path, canonical_root: &str) -> PathBuf {
    let key = stable_workspace_hash(canonical_root);
    app_data_dir
        .join("sync")
        .join(format!("workspace-{key:016x}.git"))
}

/// Opens or creates the hidden repository for `vault`, taking the first
/// snapshot if there is nothing recorded yet.
pub fn bootstrap(app_data_dir: &Path, vault: &Path) -> Result<ManagedWorkspace, NativeError> {
    let has_own_git = vault.join(".git").exists();

    let git_dir = hidden_repo_path(app_data_dir, &vault.to_string_lossy());
    let repo = hidden_repo::open_or_create(&git_dir, vault)?;
    write_exclude_file(&git_dir)?;

    let took_first_snapshot = snapshot::head_commit(&repo)?.is_none();
    if took_first_snapshot {
        let notes: Vec<PathBuf> = recordable_notes(vault)?
            .into_iter()
            .filter(|note| !super::conflict::excluded_from_history(vault, note))
            .collect();
        if !notes.is_empty() {
            snapshot::record(&repo, &notes, "Sync — first snapshot of this workspace")?;
        }
    }

    Ok(ManagedWorkspace {
        repo,
        took_first_snapshot,
        has_own_git,
    })
}

/// Writes the ignore rules into the repository rather than the vault.
///
/// A `.gitignore` would be a file in the user's notes folder that they did not
/// create, that every sync daemon would then replicate to their other devices.
/// `info/exclude` is the same rules, kept where the rest of the repository is.
fn write_exclude_file(git_dir: &Path) -> Result<(), NativeError> {
    let info = git_dir.join("info");
    std::fs::create_dir_all(&info).map_err(exclude_write_failed)?;

    let mut contents =
        String::from("# Written by ThinkBrain Notes. Files Auto Sync never records.\n");
    for pattern in NEVER_RECORD {
        contents.push_str(pattern);
        contents.push('\n');
    }

    std::fs::write(info.join("exclude"), contents).map_err(exclude_write_failed)
}

/// Every file in the vault worth recording, as vault-relative paths.
pub fn recordable_notes(vault: &Path) -> Result<Vec<PathBuf>, NativeError> {
    recordable_under(vault, vault)
}

/// Every recordable file under `directory`, still vault-relative.
pub fn recordable_under(vault: &Path, directory: &Path) -> Result<Vec<PathBuf>, NativeError> {
    let depth = directory
        .strip_prefix(vault)
        .map(|relative| relative.components().count())
        .unwrap_or(0);
    let mut found = Vec::new();
    collect(vault, directory, depth, &mut found)?;
    found.sort();
    Ok(found)
}

fn collect(
    vault: &Path,
    directory: &Path,
    depth: usize,
    found: &mut Vec<PathBuf>,
) -> Result<(), NativeError> {
    if depth > MAX_MARKDOWN_DEPTH {
        return Err(NativeError::new(
            "sync.vault_too_deep",
            "This workspace's folders are nested deeper than Auto Sync can safely walk.",
        ));
    }

    let entries = std::fs::read_dir(directory).map_err(vault_read)?;

    for entry in entries {
        let entry = entry.map_err(vault_read)?;
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();

        if is_never_recorded(&name) || is_ignored_entry_name(&name) {
            continue;
        }

        // Symlinks are not followed: a link pointing outside the vault would
        // pull unrelated files into history, and one pointing back inside it
        // would record the same note twice.
        let metadata = entry.metadata().map_err(vault_read)?;

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
    NEVER_RECORD
        .iter()
        .any(|pattern| match pattern.strip_prefix('*') {
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

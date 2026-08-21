//! The per-workspace hidden repository.
//!
//! A vault is a folder of ordinary Markdown files, and it stays that way: the
//! repository that tracks it lives in OS app-data and points back at the vault
//! as its worktree. Nothing is written inside the vault — no `.git`, no config,
//! nothing for a sync daemon to replicate or for the user to trip over.
//!
//! The link between the two is `core.worktree` in the repository's own config,
//! which is what `git init --separate-git-dir` writes and what gix reads back
//! when the repository is not bare. gix offers no separate-worktree `init`, so
//! the repository is created bare and then un-bared here.

use std::fs;
use std::io::Write;
use std::path::Path;

use crate::NativeError;

use super::failed;

/// Opens the hidden repository for a vault, creating it on first use.
///
/// `git_dir` is the app-data location holding the repository itself; `vault` is
/// the folder whose contents it tracks. The pair is recorded in the
/// repository's config, so reopening it later needs only the `git_dir`.
pub fn open_or_create(git_dir: &Path, vault: &Path) -> Result<gix::Repository, NativeError> {
    if !git_dir.join("HEAD").exists() {
        create(git_dir, vault)?;
    }
    open(git_dir)
}

fn open(git_dir: &Path) -> Result<gix::Repository, NativeError> {
    gix::open(git_dir).map_err(|error| {
        failed(
            "sync.repo_open_failed",
            "Could not open this workspace's sync history.",
            error,
        )
    })
}

fn create(git_dir: &Path, vault: &Path) -> Result<(), NativeError> {
    // The repository sits a couple of levels inside app-data, and on a fresh
    // install none of that exists yet.
    if let Some(parent) = git_dir.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            failed(
                "sync.repo_create_failed",
                "Could not create this workspace's sync history.",
                error,
            )
        })?;
    }

    gix::init_bare(git_dir).map_err(|error| {
        failed(
            "sync.repo_create_failed",
            "Could not create this workspace's sync history.",
            error,
        )
    })?;

    // `gix::init_bare` respects `init.defaultBranch` from the system/user git
    // config, which is `master` on older Windows git installs and `main` on
    // newer ones. The sync layer always records history on `refs/heads/main`
    // (see `snapshot::HISTORY_REF`), so HEAD must point there regardless of the
    // platform default — otherwise `repo.head_commit()` reports an unborn
    // `refs/heads/master` while the real history lives on a different ref.
    std::fs::write(git_dir.join("HEAD"), "ref: refs/heads/main\n").map_err(|error| {
        failed(
            "sync.repo_create_failed",
            "Could not create this workspace's sync history.",
            error,
        )
    })?;

    point_at_worktree(git_dir, vault)
}

/// Rewrites the freshly created config so the repository claims `vault` as its
/// worktree.
///
/// This is a file write rather than a call through `Repository`: gix's
/// `config_snapshot_mut().commit()` updates only the in-memory configuration
/// and never touches the file, so a repository configured that way reads back
/// as bare on the next open.
fn point_at_worktree(git_dir: &Path, vault: &Path) -> Result<(), NativeError> {
    let config_path = git_dir.join("config");
    let config_failed = |error: String| {
        failed(
            "sync.repo_create_failed",
            "Could not point this workspace's sync history at its notes.",
            error,
        )
    };

    let mut config =
        gix::config::File::from_path_no_includes(config_path.clone(), gix::config::Source::Local)
            .map_err(|error| config_failed(error.to_string()))?;

    config
        .set_raw_value("core.bare", "false")
        .map_err(|error| config_failed(error.to_string()))?;
    config
        .set_raw_value("core.worktree", vault.to_string_lossy().as_ref())
        .map_err(|error| config_failed(error.to_string()))?;

    let mut written = Vec::new();
    config
        .write_to(&mut written)
        .map_err(|error| config_failed(error.to_string()))?;

    let mut file =
        fs::File::create(&config_path).map_err(|error| config_failed(error.to_string()))?;
    file.write_all(&written)
        .map_err(|error| config_failed(error.to_string()))?;
    file.sync_all()
        .map_err(|error| config_failed(error.to_string()))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::make_temp_test_dir;

    /// The whole promise of the hidden repo in one test: it tracks the vault
    /// without leaving anything in it. A `.git` inside the vault would be
    /// replicated by every sync daemon the user runs, which is the failure this
    /// design exists to avoid.
    #[test]
    fn a_hidden_repo_tracks_a_vault_without_writing_anything_into_it() {
        let vault = make_temp_test_dir("hidden-repo-vault", "sync", true);
        let git_dir = make_temp_test_dir("hidden-repo-gitdir", "sync", true);
        fs::write(vault.join("note.md"), "# A note\n").expect("the vault holds a note");

        let repo = open_or_create(&git_dir, &vault).expect("the hidden repository is created");

        assert_eq!(
            repo.workdir().expect("the repository has a worktree"),
            vault,
            "the repository tracks a folder other than the vault"
        );
        assert!(
            !vault.join(".git").exists(),
            "the vault was given a .git directory"
        );
        let vault_entries: Vec<_> = fs::read_dir(&vault)
            .expect("the vault is readable")
            .map(|entry| entry.expect("the vault entry is readable").file_name())
            .collect();
        assert_eq!(
            vault_entries,
            ["note.md"],
            "creating the repository added files to the vault"
        );
    }

    /// Opening twice must not start over: the second call has to find the
    /// repository the first one made, or every launch would orphan its history.
    #[test]
    fn opening_an_existing_hidden_repo_reuses_it() {
        let vault = make_temp_test_dir("hidden-repo-reuse-vault", "sync", true);
        let git_dir = make_temp_test_dir("hidden-repo-reuse-gitdir", "sync", true);

        let first = open_or_create(&git_dir, &vault).expect("the hidden repository is created");
        let second = open_or_create(&git_dir, &vault).expect("the hidden repository is reopened");

        assert_eq!(first.git_dir(), second.git_dir());
        assert_eq!(
            second
                .workdir()
                .expect("the reopened repository has a worktree"),
            vault
        );
    }
}

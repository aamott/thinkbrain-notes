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

        if is_never_recorded(&name) {
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
            // Skip directories that are ignored (dotfiles and configured folders like
            // node_modules, target, dist, vendor). This keeps history clean and matches
            // what the rest of the app considers part of the vault.
            if !is_ignored_entry_name(&name) {
                collect(vault, &path, depth + 1, found)?;
            }
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
fn is_never_recorded(name: &str) -> bool {
    NEVER_RECORD.iter().any(|pattern| match pattern.strip_prefix('*') {
        Some(suffix) => name.ends_with(suffix),
        None => match pattern.strip_suffix('*') {
            Some(prefix) => name.starts_with(prefix),
            None => name == *pattern,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::make_temp_test_dir;
    use std::fs;

    fn write(root: &Path, relative: &str, contents: &str) {
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("the folder exists");
        }
        fs::write(path, contents).expect("the file is written");
    }

    fn managed(result: Managed) -> ManagedWorkspace {
        match result {
            Managed::Yes(workspace) => *workspace,
            Managed::HasOwnGit => panic!("the vault was expected to be managed"),
        }
    }

    fn recorded_paths(repo: &gix::Repository) -> Vec<String> {
        let Some(commit) = snapshot::head_commit(repo).expect("the history is readable") else {
            return Vec::new();
        };
        let tree = repo
            .find_commit(commit)
            .expect("the commit exists")
            .tree()
            .expect("the tree exists");
        let mut recorder = gix::traverse::tree::Recorder::default();
        tree.traverse()
            .breadthfirst(&mut recorder)
            .expect("the tree is walkable");
        let mut paths: Vec<String> = recorder
            .records
            .iter()
            .filter(|entry| entry.mode.is_blob())
            .map(|entry| entry.filepath.to_string())
            .collect();
        paths.sort();
        paths
    }

    #[test]
    fn each_workspace_gets_its_own_hidden_repo() {
        let app_data = Path::new("/app-data");

        let one = hidden_repo_path(app_data, "/notes/work");
        let two = hidden_repo_path(app_data, "/notes/personal");

        assert_ne!(one, two, "two vaults were given the same history");
        assert_eq!(
            one,
            hidden_repo_path(app_data, "/notes/work"),
            "one vault was given two histories"
        );
        assert!(one.starts_with(app_data.join("sync")));
    }

    /// The one case where the right answer is to do nothing. A vault that is
    /// already a git repository belongs to whoever set it up, and a second tool
    /// committing into it — or beside it — is how someone loses work they were
    /// managing carefully.
    #[test]
    fn a_vault_with_its_own_git_is_left_alone() {
        let app_data = make_temp_test_dir("bootstrap-own-git-appdata", "sync", true);
        let vault = make_temp_test_dir("bootstrap-own-git-vault", "sync", true);
        fs::create_dir(vault.join(".git")).expect("the vault has its own repository");
        write(&vault, "note.md", "# A note\n");

        let result = bootstrap(&app_data, &vault).expect("bootstrap decides");

        assert!(matches!(result, Managed::HasOwnGit));
        assert!(
            !app_data.join("sync").exists(),
            "a hidden repository was created for a vault that has its own"
        );
    }

    #[test]
    fn an_empty_vault_bootstraps_without_a_commit() {
        let app_data = make_temp_test_dir("bootstrap-empty-appdata", "sync", true);
        let vault = make_temp_test_dir("bootstrap-empty-vault", "sync", true);

        let workspace = managed(bootstrap(&app_data, &vault).expect("bootstrap succeeds"));

        assert_eq!(
            snapshot::head_commit(&workspace.repo).expect("the history is readable"),
            None,
            "an empty vault was given a commit with nothing in it"
        );
    }

    /// A vault the user has kept for years arrives all at once. Its first
    /// commit has to be the whole thing, or the history starts with a fiction
    /// in which every existing note was created the day they installed this.
    #[test]
    fn a_vault_of_existing_notes_is_snapshotted_whole() {
        let app_data = make_temp_test_dir("bootstrap-existing-appdata", "sync", true);
        let vault = make_temp_test_dir("bootstrap-existing-vault", "sync", true);
        write(&vault, "one.md", "# One\n");
        write(&vault, "journal/2026/08-16.md", "# Today\n");

        let workspace = managed(bootstrap(&app_data, &vault).expect("bootstrap succeeds"));

        assert_eq!(recorded_paths(&workspace.repo), ["journal/2026/08-16.md", "one.md"]);
    }

    #[test]
    fn bootstrapping_again_does_not_snapshot_again() {
        let app_data = make_temp_test_dir("bootstrap-twice-appdata", "sync", true);
        let vault = make_temp_test_dir("bootstrap-twice-vault", "sync", true);
        write(&vault, "one.md", "# One\n");

        let first = managed(bootstrap(&app_data, &vault).expect("bootstrap succeeds"));
        assert!(first.took_first_snapshot, "the first open did not record the vault");
        let first_head = snapshot::head_commit(&first.repo).expect("the history is readable");
        drop(first);

        let second = managed(bootstrap(&app_data, &vault).expect("bootstrap succeeds again"));

        assert!(
            !second.took_first_snapshot,
            "reopening the workspace re-read every note in it"
        );
        assert_eq!(
            snapshot::head_commit(&second.repo).expect("the history is readable"),
            first_head,
            "reopening the workspace recorded the vault a second time"
        );
    }

    /// Half-written files are the dangerous half of this list: a partial
    /// download recorded as a version is a version that restores to garbage.
    #[test]
    fn os_junk_and_half_written_files_are_not_recorded() {
        let app_data = make_temp_test_dir("bootstrap-junk-appdata", "sync", true);
        let vault = make_temp_test_dir("bootstrap-junk-vault", "sync", true);
        write(&vault, "note.md", "# A note\n");
        write(&vault, ".DS_Store", "junk");
        write(&vault, "Thumbs.db", "junk");
        write(&vault, "desktop.ini", "junk");
        write(&vault, "note.md.tmp", "half written");
        write(&vault, "~$note.md", "lock");
        write(&vault, ".~lock.note.md#", "lock");

        let workspace = managed(bootstrap(&app_data, &vault).expect("bootstrap succeeds"));

        assert_eq!(recorded_paths(&workspace.repo), ["note.md"]);
    }

    /// A symlink is not a note, and following one is how a vault's history ends
    /// up holding files from outside the vault — or the same note twice.
    #[cfg(unix)]
    #[test]
    fn symlinks_are_not_followed_into_the_snapshot() {
        let app_data = make_temp_test_dir("bootstrap-symlink-appdata", "sync", true);
        let vault = make_temp_test_dir("bootstrap-symlink-vault", "sync", true);
        let outside = make_temp_test_dir("bootstrap-symlink-outside", "sync", true);
        write(&outside, "secret.md", "# Not a note of theirs\n");
        write(&vault, "note.md", "# A note\n");
        std::os::unix::fs::symlink(outside.join("secret.md"), vault.join("linked.md"))
            .expect("the vault holds a symlink");
        std::os::unix::fs::symlink(&outside, vault.join("linked-folder"))
            .expect("the vault holds a symlinked folder");

        let workspace = managed(bootstrap(&app_data, &vault).expect("bootstrap succeeds"));

        assert_eq!(recorded_paths(&workspace.repo), ["note.md"]);
    }

    /// A conflict copy is a daemon's mess, not a version of the user's note, so
    /// it stays out of the history that gets pushed — otherwise their other
    /// machine syncs it straight back down. Nothing is lost by leaving it out:
    /// a checkpoint holds both sides before any resolution touches them, which
    /// is exactly why these are not in the ignore rules either.
    #[test]
    fn conflict_copies_stay_out_of_history_without_being_ignored() {
        let app_data = make_temp_test_dir("bootstrap-conflict-appdata", "sync", true);
        let vault = make_temp_test_dir("bootstrap-conflict-vault", "sync", true);
        write(&vault, "note.md", "# Mine\n");
        write(&vault, "note.sync-conflict-20260816-093100-K3SDFHG.md", "# Theirs\n");
        write(&vault, "note (Adam's conflicted copy 2026-08-16).md", "# Theirs\n");

        let workspace = managed(bootstrap(&app_data, &vault).expect("bootstrap succeeds"));

        assert_eq!(recorded_paths(&workspace.repo), ["note.md"]);

        let git_dir = hidden_repo_path(&app_data, &vault.to_string_lossy());
        let exclude = fs::read_to_string(git_dir.join("info/exclude")).expect("the exclude file is written");
        assert!(
            !exclude.contains("conflict"),
            "conflict copies were ignored, which would put them out of reach of a checkpoint"
        );
    }

    /// The ignore rules live in the repository, never in the vault: a
    /// `.gitignore` the user did not create would be replicated to every device
    /// their sync daemon reaches.
    #[test]
    fn the_ignore_rules_live_in_the_repository_not_the_vault() {
        let app_data = make_temp_test_dir("bootstrap-exclude-appdata", "sync", true);
        let vault = make_temp_test_dir("bootstrap-exclude-vault", "sync", true);

        bootstrap(&app_data, &vault).expect("bootstrap succeeds");

        assert!(!vault.join(".gitignore").exists(), "the vault was given a .gitignore");
        let git_dir = hidden_repo_path(&app_data, &vault.to_string_lossy());
        let exclude = fs::read_to_string(git_dir.join("info/exclude")).expect("the exclude file is written");
        assert!(exclude.contains(".DS_Store"));
        assert!(exclude.contains("*.tmp"));
    }

    /// Ignored folders (dotfiles and IGNORED_FOLDERS) should be skipped during
    /// walks. Ignored directories should not be recursed into, but non-Markdown
    /// files beside notes should still be recorded (e.g. images, PDFs, scripts).
    #[test]
    fn ignored_folders_are_pruned_but_non_markdown_files_are_kept() {
        let app_data = make_temp_test_dir("bootstrap-ignored-folders-appdata", "sync", true);
        let vault = make_temp_test_dir("bootstrap-ignored-folders-vault", "sync", true);
        write(&vault, "note.md", "# A note\n");
        write(&vault, "diagram.png", "PNG data");
        write(&vault, "script.py", "print('hello')\n");
        write(&vault, "node_modules/lodash/index.js", "module code");
        write(&vault, ".obsidian/config.json", "config");
        write(&vault, "target/debug/app", "binary");

        let workspace = managed(bootstrap(&app_data, &vault).expect("bootstrap succeeds"));

        let paths = recorded_paths(&workspace.repo);
        assert!(
            paths.contains(&"note.md".to_string()),
            "markdown note should be recorded"
        );
        assert!(
            paths.contains(&"diagram.png".to_string()),
            "non-markdown file should be recorded"
        );
        assert!(
            paths.contains(&"script.py".to_string()),
            "script file should be recorded"
        );
        assert!(
            !paths.iter().any(|p| p.starts_with("node_modules/")),
            "files in node_modules/ should not be recorded"
        );
        assert!(
            !paths.iter().any(|p| p.starts_with(".obsidian/")),
            "files in .obsidian/ should not be recorded"
        );
        assert!(
            !paths.iter().any(|p| p.starts_with("target/")),
            "files in target/ should not be recorded"
        );
    }

    /// Deep nesting should not be walked beyond MAX_MARKDOWN_DEPTH. Vaults
    /// nested too deeply should fail bootstrap with a clear error rather than
    /// hang or panic.
    #[test]
    fn a_vault_nested_too_deeply_fails_with_depth_limit_error() {
        let app_data = make_temp_test_dir("bootstrap-depth-appdata", "sync", true);
        let vault = make_temp_test_dir("bootstrap-depth-vault", "sync", true);

        // Create a deeply nested structure (25 levels deep, beyond MAX_MARKDOWN_DEPTH of 20)
        let mut path = vault.clone();
        for i in 0..25 {
            path = path.join(format!("level{}", i));
        }
        fs::create_dir_all(&path).expect("deeply nested folders are created");
        write(&path, "note.md", "# Deep note\n");

        let result = bootstrap(&app_data, &vault);

        match result {
            Err(error) => {
                assert_eq!(error.code, "sync.vault_too_deep");
                assert!(
                    error.message.to_lowercase().contains("deep"),
                    "error message should mention depth limit"
                );
            }
            Ok(_) => panic!("bootstrap should fail for deeply nested vault"),
        }
    }

    /// A vault with too many entries should fail bootstrap with a clear error
    /// rather than exhausting memory or hanging.
    #[test]
    fn a_vault_with_too_many_entries_fails_with_entry_cap_error() {
        let app_data = make_temp_test_dir("bootstrap-cap-appdata", "sync", true);
        let vault = make_temp_test_dir("bootstrap-cap-vault", "sync", true);

        // Create MAX_WORKSPACE_ENTRIES + 1 files
        for i in 0..=(MAX_WORKSPACE_ENTRIES as u32) {
            write(&vault, &format!("note{:05}.md", i), "# Note\n");
        }

        let result = bootstrap(&app_data, &vault);

        match result {
            Err(error) => {
                assert_eq!(error.code, "sync.vault_too_many_entries");
                assert!(
                    error.message.to_lowercase().contains("more notes"),
                    "error message should mention entry count"
                );
            }
            Ok(_) => panic!("bootstrap should fail for vault with too many entries"),
        }
    }
}

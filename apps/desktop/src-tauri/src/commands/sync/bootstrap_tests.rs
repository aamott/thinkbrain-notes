use super::super::test_support::write;
use super::*;
use crate::tests::make_temp_test_dir;
use std::fs;
use std::path::PathBuf;

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

/// The one case where the right answer is to do nothing. A notes folder under
/// someone's own version control is exactly the folder most likely to also be
/// in a sync folder, so refusing it cost the whole feature to the people most
/// likely to need it. Never touching their repository is a separate promise,
/// and it keeps itself: ours lives in app data, and the walk skips every
/// dot-directory, `.git` among them.
#[test]
fn a_vault_with_its_own_git_is_recorded_too_and_its_repository_left_alone() {
    let app_data = make_temp_test_dir("bootstrap-own-git-appdata", "sync", true);
    let vault = make_temp_test_dir("bootstrap-own-git-vault", "sync", true);
    fs::create_dir(vault.join(".git")).expect("the vault has its own repository");
    fs::write(vault.join(".git").join("HEAD"), "ref: refs/heads/main\n").expect("written");
    write(&vault, "note.md", "# A note\n");

    let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");

    assert!(
        workspace.has_own_git,
        "the second history should be declared, not hidden"
    );
    assert_eq!(
        recorded_paths(&workspace.repo),
        ["note.md"],
        "the note is recorded and nothing of their repository is"
    );
}

#[test]
fn an_empty_vault_bootstraps_without_a_commit() {
    let app_data = make_temp_test_dir("bootstrap-empty-appdata", "sync", true);
    let vault = make_temp_test_dir("bootstrap-empty-vault", "sync", true);

    let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");

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

    let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");

    assert_eq!(
        recorded_paths(&workspace.repo),
        ["journal/2026/08-16.md", "one.md"]
    );
}

#[test]
fn bootstrapping_again_does_not_snapshot_again() {
    let app_data = make_temp_test_dir("bootstrap-twice-appdata", "sync", true);
    let vault = make_temp_test_dir("bootstrap-twice-vault", "sync", true);
    write(&vault, "one.md", "# One\n");

    let first = bootstrap(&app_data, &vault).expect("bootstrap succeeds");
    assert!(
        first.took_first_snapshot,
        "the first open did not record the vault"
    );
    let first_head = snapshot::head_commit(&first.repo).expect("the history is readable");
    drop(first);

    let second = bootstrap(&app_data, &vault).expect("bootstrap succeeds again");

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

    let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");

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

    let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");

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
    write(
        &vault,
        "note.sync-conflict-20260816-093100-K3SDFHG.md",
        "# Theirs\n",
    );
    write(
        &vault,
        "note (Adam's conflicted copy 2026-08-16).md",
        "# Theirs\n",
    );

    let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");

    assert_eq!(recorded_paths(&workspace.repo), ["note.md"]);

    let git_dir = hidden_repo_path(&app_data, &vault.to_string_lossy());
    let exclude =
        fs::read_to_string(git_dir.join("info/exclude")).expect("the exclude file is written");
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

    assert!(
        !vault.join(".gitignore").exists(),
        "the vault was given a .gitignore"
    );
    let git_dir = hidden_repo_path(&app_data, &vault.to_string_lossy());
    let exclude =
        fs::read_to_string(git_dir.join("info/exclude")).expect("the exclude file is written");
    assert!(exclude.contains(".DS_Store"));
    assert!(exclude.contains("*.tmp"));
}

/// Ignored names (dotfiles, IGNORED_FOLDERS) are not part of the vault, so they
/// stay out of history. Non-Markdown files beside notes are still recorded.
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
    write(&vault, "notes/.hidden.md", "secret");

    let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");

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
    assert!(
        !paths.iter().any(|p| p.contains(".hidden.md")),
        "hidden files should not be recorded"
    );
}

/// Deep nesting should not be walked beyond MAX_MARKDOWN_DEPTH. Vaults
/// nested too deeply should fail bootstrap with a clear error rather than
/// hang or panic.
#[test]
fn a_vault_nested_too_deeply_fails_with_depth_limit_error() {
    let app_data = make_temp_test_dir("bootstrap-depth-appdata", "sync", true);
    let vault = make_temp_test_dir("bootstrap-depth-vault", "sync", true);

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

/// Cold bootstrap, reopen, and one-file incremental recording for exactly
/// 10,000 small notes.
///
/// Ignored so ordinary `cargo test` / CI do not spend minutes writing and
/// hashing a ceiling-sized vault. Absolute wall times vary by machine; this
/// prints them and asserts only ratios — reopen and incremental must be
/// materially cheaper than cold bootstrap, with no hardware-dependent cutoff.
///
/// Run with:
/// `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
///   measures_a_ten_thousand_note_vault -- --ignored --nocapture`
#[test]
#[ignore = "reproducible 10k-vault measurement; run with --ignored --nocapture"]
fn measures_a_ten_thousand_note_vault() {
    use std::time::Instant;

    const COUNT: usize = 10_000;
    assert_eq!(
        COUNT, MAX_WORKSPACE_ENTRIES,
        "measurement must sit on the documented vault ceiling"
    );

    let app_data = make_temp_test_dir("bootstrap-10k-appdata", "sync", true);
    let vault = make_temp_test_dir("bootstrap-10k-vault", "sync", true);
    for i in 0..COUNT {
        write(&vault, &format!("note{i:05}.md"), "# n\n");
    }

    let cold_started = Instant::now();
    let cold = bootstrap(&app_data, &vault).expect("cold bootstrap succeeds");
    let cold_elapsed = cold_started.elapsed();
    assert!(
        cold.took_first_snapshot,
        "cold open must take the first snapshot"
    );
    assert_eq!(
        recorded_paths(&cold.repo).len(),
        COUNT,
        "every note must land in the first snapshot"
    );
    drop(cold);

    let reopen_started = Instant::now();
    let reopened = bootstrap(&app_data, &vault).expect("reopen succeeds");
    let reopen_elapsed = reopen_started.elapsed();
    assert!(
        !reopened.took_first_snapshot,
        "reopen must not walk the vault again"
    );

    write(&vault, "note00000.md", "# edited\n");
    let incremental_started = Instant::now();
    snapshot::record(
        &reopened.repo,
        &[PathBuf::from("note00000.md")],
        "Sync — one note changed",
    )
    .expect("incremental record succeeds");
    let incremental_elapsed = incremental_started.elapsed();

    let cold_ms = cold_elapsed.as_secs_f64() * 1000.0;
    let reopen_ms = reopen_elapsed.as_secs_f64() * 1000.0;
    let incremental_ms = incremental_elapsed.as_secs_f64() * 1000.0;
    let reopen_ratio = cold_ms / reopen_ms.max(0.001);
    let incremental_ratio = cold_ms / incremental_ms.max(0.001);

    eprintln!("10k-vault measurement (absolute + ratios vs cold bootstrap):");
    eprintln!("  cold bootstrap: {cold_elapsed:?} ({cold_ms:.1} ms)");
    eprintln!(
        "  reopen:         {reopen_elapsed:?} ({reopen_ms:.1} ms) — {reopen_ratio:.1}x cheaper"
    );
    eprintln!(
        "  incremental:    {incremental_elapsed:?} ({incremental_ms:.1} ms) — {incremental_ratio:.1}x cheaper"
    );

    assert!(
        reopen_ms * 2.0 < cold_ms,
        "reopen should be materially cheaper than cold bootstrap (reopen {reopen_ms:.1} ms, cold {cold_ms:.1} ms)"
    );
    assert!(
        incremental_ms * 2.0 < cold_ms,
        "one-file incremental should be materially cheaper than cold bootstrap (incremental {incremental_ms:.1} ms, cold {cold_ms:.1} ms)"
    );
}

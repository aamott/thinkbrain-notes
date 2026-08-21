use super::*;
use crate::commands::sync::bootstrap::hidden_repo_path;
use crate::commands::sync::push;
use crate::commands::sync::sign_in::upsert_profile;
use crate::commands::sync::snapshot;
use crate::tests::make_temp_test_dir;
use std::fs;
use std::path::PathBuf;

use super::super::test_support;

fn parent(name: &str) -> PathBuf {
    make_temp_test_dir(&format!("{name}-parent"), "import", true)
}

fn app_data(name: &str) -> PathBuf {
    make_temp_test_dir(&format!("{name}-appdata"), "import", true)
}

fn source_device(name: &str) -> test_support::RepoFixture {
    test_support::repo_fixture(name, "import")
}

fn record_note(fixture: &test_support::RepoFixture, relative: &str, contents: &str) {
    test_support::write(&fixture.vault, relative, contents);
    snapshot::record(
        &fixture.repo,
        &[PathBuf::from(relative)],
        &format!("changed {relative}"),
    )
    .expect("recorded");
}

fn bare_remote(name: &str) -> PathBuf {
    let path = make_temp_test_dir(name, "import", true);
    gix::init_bare(&path).expect("bare remote");
    path
}

fn settings_of(app_data: &std::path::Path, root: &std::path::Path) -> String {
    fs::read_to_string(crate::commands::settings::workspace_settings_path(
        app_data, root,
    ))
    .expect("workspace settings exist")
}

// ---------------------------------------------------------------------------
// Child name
// ---------------------------------------------------------------------------

#[test]
fn https_links_drop_git_and_a_trailing_slash() {
    assert_eq!(
        child_name_from_link("https://github.com/you/notes.git").expect("name"),
        "notes"
    );
    assert_eq!(
        child_name_from_link("https://github.com/you/notes.git/").expect("name"),
        "notes"
    );
    assert_eq!(
        child_name_from_link("  https://gitlab.example/group/my-vault  ").expect("name"),
        "my-vault"
    );
}

#[test]
fn a_local_bare_folder_uses_the_last_path_segment() {
    assert_eq!(
        child_name_from_link("/home/you/shared/notes.git").expect("name"),
        "notes"
    );
}

#[test]
fn empty_dot_and_separator_names_are_refused() {
    for link in [
        "https://github.com/you/.git",
        "https://github.com/you/.",
        "https://github.com/you/..",
        "https://github.com/you/a/../b",
    ] {
        let error = child_name_from_link(link).expect_err(link);
        assert_eq!(error.code, "sync.import_name_invalid", "{link}");
    }
}

#[test]
fn control_characters_and_path_separators_are_refused() {
    let slash = child_name_from_link("https://example.test/a\\b").expect_err("backslash");
    assert_eq!(slash.code, "sync.import_name_invalid");
    let control = child_name_from_link("https://example.test/no\u{0007}tes").expect_err("bell");
    assert_eq!(control.code, "sync.import_name_invalid");
    for character in ['<', '>', ':', '"', '|', '?', '*'] {
        let link = format!("/tmp/no{character}tes.git");
        assert_eq!(
            child_name_from_link(&link).expect_err(&link).code,
            "sync.import_name_invalid"
        );
    }
}

#[test]
fn windows_reserved_and_device_names_are_refused() {
    for name in [
        "con", "prn", "aux", "nul", "COM1", "lpt9", "con.txt", "nul.",
    ] {
        let link = format!("https://example.test/{name}");
        let error = child_name_from_link(&link).expect_err(&link);
        assert_eq!(error.code, "sync.import_name_invalid", "{link}");
    }
}

#[test]
fn trailing_dots_and_spaces_are_stripped_then_rejected_if_empty() {
    assert_eq!(
        child_name_from_link("https://example.test/notes. ").expect("stripped"),
        "notes"
    );
    let error = child_name_from_link("https://example.test/...").expect_err("dots");
    assert_eq!(error.code, "sync.import_name_invalid");
}

#[test]
fn preview_returns_the_native_join_not_a_frontend_guess() {
    let parent = parent("preview");
    let preview = preview_from_git_link(
        "https://github.com/you/notes.git",
        &parent.to_string_lossy(),
    )
    .expect("preview");

    assert_eq!(preview.child_name, "notes");
    assert_eq!(
        std::path::Path::new(&preview.target_path),
        parent.join("notes")
    );
}

// ---------------------------------------------------------------------------
// Prepare: create, refuse, persist
// ---------------------------------------------------------------------------

#[test]
fn an_existing_child_folder_is_refused_and_left_alone() {
    let app_data = app_data("exists");
    let parent = parent("exists");
    let target = parent.join("notes");
    fs::create_dir(&target).expect("existing child");
    fs::write(target.join("keep.md"), "keep\n").expect("pre-existing file");

    let error = prepare_import(
        &app_data,
        "https://github.com/you/notes.git",
        &parent.to_string_lossy(),
        None,
    )
    .expect_err("must refuse");

    assert_eq!(error.code, "sync.import_target_exists");
    assert!(
        target.join("keep.md").is_file(),
        "pre-existing file was removed"
    );
    assert!(
        !crate::commands::settings::workspace_settings_path(&app_data, &target).exists(),
        "settings were written for a refused target"
    );
}

#[test]
fn settings_name_the_link_and_profile_without_a_token() {
    let app_data = app_data("persist");
    let parent = parent("persist");
    let profile = upsert_profile(
        "https://github.com/you/notes.git",
        "you",
        "s3cret-token",
        None,
        None,
    )
    .expect("profile");

    let prepared = prepare_import(
        &app_data,
        "https://you:s3cret-token@github.com/you/notes.git",
        &parent.to_string_lossy(),
        Some(&profile.id),
    )
    .expect("prepared");

    let written = settings_of(&app_data, &prepared.target);
    assert!(written.contains("https://github.com/you/notes.git"));
    assert!(written.contains(&profile.id));
    assert!(
        !written.contains("s3cret-token"),
        "token leaked into workspace settings"
    );
    fs::remove_dir_all(&prepared.target).ok();
}

#[test]
fn a_public_import_persists_an_empty_profile_selection() {
    let app_data = app_data("public");
    let parent = parent("public");
    let prepared = prepare_import(
        &app_data,
        "https://github.com/you/notes.git",
        &parent.to_string_lossy(),
        None,
    )
    .expect("prepared");

    let written = settings_of(&app_data, &prepared.target);
    assert!(written.contains(r#""sync.signInProfile": """#));
    fs::remove_dir_all(&prepared.target).ok();
}

#[test]
fn a_missing_profile_is_not_replaced_with_another() {
    let app_data = app_data("missing-profile");
    let parent = parent("missing-profile");
    let error = prepare_import(
        &app_data,
        "https://github.com/you/notes.git",
        &parent.to_string_lossy(),
        Some("p-gone"),
    )
    .expect_err("missing profile");

    assert_eq!(error.code, "sync.sign_in_missing");
    assert!(!parent.join("notes").exists(), "folder was created anyway");
}

#[test]
fn a_profile_saved_for_another_host_is_refused() {
    let app_data = app_data("wrong-host");
    let parent = parent("wrong-host");
    let profile = upsert_profile(
        "https://github.com/you/notes.git",
        "you",
        "token",
        None,
        None,
    )
    .expect("profile");
    let error = prepare_import(
        &app_data,
        "https://gitlab.com/you/notes.git",
        &parent.to_string_lossy(),
        Some(&profile.id),
    )
    .expect_err("wrong host");

    assert_eq!(error.code, "sync.sign_in_wrong_host");
    assert!(!parent.join("notes").exists());
}

// ---------------------------------------------------------------------------
// Complete: fetch, cleanup, empty, default branch, no .git
// ---------------------------------------------------------------------------

#[test]
fn a_failed_fetch_removes_the_child_folder_settings_and_hidden_repo() {
    let app_data = app_data("cleanup");
    let parent = parent("cleanup");
    let junk = make_temp_test_dir("cleanup-junk", "import", true);
    let prepared = prepare_import(
        &app_data,
        &junk.to_string_lossy(),
        &parent.to_string_lossy(),
        None,
    )
    .expect("folder created");
    let target = prepared.target.clone();
    let settings = crate::commands::settings::workspace_settings_path(&app_data, &target);
    let hidden = hidden_repo_path(&app_data, &target.to_string_lossy());

    let error = complete_import(&app_data, prepared, |_| {}).expect_err("fetch must fail");
    assert!(
        error.code.starts_with("sync."),
        "unexpected cleanup error: {} {}",
        error.code,
        error.message
    );
    assert!(!target.exists(), "created folder was left behind");
    assert!(!settings.exists(), "settings were left behind");
    assert!(!hidden.exists(), "hidden repo was left behind");
    assert!(parent.is_dir(), "parent was removed");
}

#[test]
fn an_empty_remote_creates_an_empty_linked_workspace_without_git_in_the_vault() {
    let app_data = app_data("empty");
    let parent = parent("empty");
    let remote = make_temp_test_dir("empty-remote", "import", true);
    gix::init_bare(&remote).expect("bare remote");

    let prepared = prepare_import(
        &app_data,
        &remote.to_string_lossy(),
        &parent.to_string_lossy(),
        None,
    )
    .expect("prepared");
    let target = complete_import(&app_data, prepared, |_| {}).expect("empty remote is fine");

    assert!(target.is_dir());
    assert!(!target.join(".git").exists(), "vault grew a .git");
    let entries: Vec<_> = fs::read_dir(&target)
        .expect("readable")
        .map(|entry| entry.expect("entry").file_name())
        .collect();
    assert!(entries.is_empty(), "empty remote left files: {entries:?}");
    let written = settings_of(&app_data, &target);
    assert!(written.contains(&*remote.to_string_lossy()));
}

#[test]
fn a_local_bare_remote_on_a_nonstandard_default_branch_is_adopted() {
    let app_data = app_data("trunk");
    let parent = parent("trunk");
    let source = source_device("import-trunk-src");
    record_note(&source, "hello.md", "from trunk\n");
    let tip = snapshot::head_commit(&source.repo)
        .expect("readable")
        .expect("recorded");
    let remote = bare_remote("trunk-remote");
    fs::write(remote.join("HEAD"), "ref: refs/heads/trunk\n").expect("HEAD");
    push::send(
        &source.repo,
        &remote.to_string_lossy(),
        "refs/heads/trunk",
        tip,
    )
    .expect("sent to trunk");

    let prepared = prepare_import(
        &app_data,
        &remote.to_string_lossy(),
        &parent.to_string_lossy(),
        None,
    )
    .expect("prepared");
    let target = complete_import(&app_data, prepared, |_| {}).expect("import");

    assert_eq!(
        fs::read_to_string(target.join("hello.md")).expect("adopted"),
        "from trunk\n"
    );
    assert!(!target.join(".git").exists());
}

#[test]
fn a_second_check_after_import_does_not_interleave_or_rewrite_notes() {
    let app_data = app_data("noop");
    let parent = parent("noop");
    let source = source_device("import-noop-src");
    record_note(&source, "only.md", "once\n");
    let there = bare_remote("import-noop");
    crate::commands::sync::round::once(&source.repo, &source.vault, &there.to_string_lossy())
        .expect("seed remote");

    let prepared = prepare_import(
        &app_data,
        &there.to_string_lossy(),
        &parent.to_string_lossy(),
        None,
    )
    .expect("prepared");
    let target = complete_import(&app_data, prepared, |_| {}).expect("import");
    let hidden = hidden_repo_path(&app_data, &target.to_string_lossy());
    let repo = gix::open(&hidden).expect("hidden repo");
    let again = crate::commands::sync::round::once(&repo, &target, &there.to_string_lossy())
        .expect("second check");

    assert_eq!(again.brought_down, 0);
    assert_eq!(
        fs::read_to_string(target.join("only.md")).expect("read"),
        "once\n"
    );
    assert!(!target.join(".git").exists());
}

#[test]
fn import_progress_never_carries_url_credentials() {
    /// Minimal error type for `remote_failure`, which now requires
    /// `std::error::Error` to walk the source chain.
    #[derive(Debug)]
    struct TestError(String);
    impl std::fmt::Display for TestError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.write_str(&self.0)
        }
    }
    impl std::error::Error for TestError {}

    let error = crate::commands::sync::remote_failure(TestError(
        "could not reach https://me:token@example.test/notes.git".to_string(),
    ));
    let payload = ImportProgress {
        request_id: "req-1".to_string(),
        state: "failed".to_string(),
        phase: None,
        target_path: "/notes/notes".to_string(),
        error: Some(error),
    };
    let json = serde_json::to_string(&payload).expect("json");
    assert!(!json.contains("token"));
    assert!(!json.contains("me:"));
    assert!(json.contains("[redacted]@example.test") || json.contains("example.test"));
}

#[test]
fn import_commands_are_registered() {
    assert_eq!(IMPORT_EVENT, "sync://import");
    assert!(crate::commands::APP_COMMAND_PATHS
        .contains(&"sync::import::preview_workspace_from_git_link"));
    assert!(crate::commands::APP_COMMAND_PATHS
        .contains(&"sync::import::import_workspace_from_git_link"));
}

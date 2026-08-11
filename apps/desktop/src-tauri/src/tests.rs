use crate::commands::{git::*, markdown::*, search::*, settings::*, workspace::*};
use crate::NativeError;
use rusqlite::Connection;
use serde_json::Value;
use std::{
    cell::RefCell,
    collections::VecDeque,
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::SystemTime,
};

#[test]
fn workspace_window_roots_are_scoped_to_opaque_window_labels() {
    let roots = WorkspaceWindowRoots::default();
    let first = next_workspace_window_label();
    let second = next_workspace_window_label();

    assert_ne!(first, second);
    assert!(first.starts_with("workspace-"));
    register_workspace_window_root(&roots, first.clone(), "/notes/first".to_string());
    register_workspace_window_root(&roots, second.clone(), "/notes/second".to_string());

    assert_eq!(
        workspace_window_root(&roots, &first),
        Some("/notes/first".to_string())
    );
    assert_eq!(
        workspace_window_root(&roots, &second),
        Some("/notes/second".to_string())
    );

    unregister_workspace_window_root(&roots, &first);
    assert_eq!(workspace_window_root(&roots, &first), None);
    assert_eq!(
        workspace_window_root(&roots, &second),
        Some("/notes/second".to_string())
    );
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GitCall {
    working_dir: Option<PathBuf>,
    args: Vec<String>,
}

struct MockGitRunner {
    results: RefCell<VecDeque<Result<GitCommandOutput, MockGitError>>>,
    calls: RefCell<Vec<GitCall>>,
}

#[derive(Debug)]
enum MockGitError {
    NotFound,
    TimedOut,
    Io,
}

impl MockGitRunner {
    fn new(results: impl IntoIterator<Item = Result<GitCommandOutput, MockGitError>>) -> Self {
        Self {
            results: RefCell::new(results.into_iter().collect()),
            calls: RefCell::new(Vec::new()),
        }
    }

    fn calls(&self) -> Vec<GitCall> {
        self.calls.borrow().clone()
    }
}

impl GitRunner for MockGitRunner {
    fn run(
        &self,
        working_dir: Option<&Path>,
        args: &[&str],
    ) -> Result<GitCommandOutput, GitRunError> {
        self.calls.borrow_mut().push(GitCall {
            working_dir: working_dir.map(Path::to_path_buf),
            args: args.iter().map(ToString::to_string).collect(),
        });

        match self
            .results
            .borrow_mut()
            .pop_front()
            .expect("mock Git result is configured")
        {
            Ok(output) => Ok(output),
            Err(MockGitError::NotFound) => Err(GitRunError::NotFound(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "git missing for test",
            ))),
            Err(MockGitError::TimedOut) => Err(GitRunError::TimedOut),
            Err(MockGitError::Io) => Err(GitRunError::Io(std::io::Error::other(
                "Git process error for test",
            ))),
        }
    }
}

fn git_output(
    success: bool,
    exit_code: Option<i32>,
    stdout: &str,
    stderr: &str,
) -> GitCommandOutput {
    GitCommandOutput {
        success,
        exit_code,
        stdout: stdout.to_string(),
        stderr: stderr.to_string(),
    }
}

fn record(
    path: &str,
    file_name: &str,
    title: Option<&str>,
    tags: &[&str],
    aliases: &[&str],
    body: &str,
) -> DocumentRecord {
    DocumentRecord {
        path: path.to_string(),
        file_name: file_name.to_string(),
        title: title.map(str::to_string),
        tags: tags.iter().map(|tag| tag.to_string()).collect(),
        aliases: aliases.iter().map(|alias| alias.to_string()).collect(),
        body: body.to_string(),
    }
}

fn in_memory_index() -> Connection {
    let connection = Connection::open_in_memory().expect("in-memory database opens");
    init_index_schema(&connection).expect("schema initializes");
    connection
}

fn result_paths(connection: &Connection, query: &str) -> Vec<String> {
    search_documents(connection, query, 50)
        .expect("search succeeds")
        .into_iter()
        .map(|hit| hit.path)
        .collect()
}

fn temp_test_dir(name: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("time is after epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("thinkbrain-notes-{name}-{unique}"));

    fs::create_dir_all(&path).expect("temp directory is created");
    path
}

#[test]
fn shell_status_reports_ready_desktop_shell() {
    let status = desktop_shell_status().expect("shell status should succeed");

    assert_eq!(status.app_name, "Thinkbrain Notes");
    assert_eq!(status.shell_version, env!("CARGO_PKG_VERSION"));
    assert!(status.ready);
}

#[test]
fn git_availability_returns_the_installed_version_from_a_bounded_command() {
    let runner =
        MockGitRunner::new([Ok(git_output(true, Some(0), "git version 2.47.1\n", ""))]);

    let availability = git_availability_with(&runner).expect("Git check succeeds");

    assert!(availability.available);
    assert_eq!(availability.version.as_deref(), Some("git version 2.47.1"));
    assert_eq!(
        runner.calls(),
        vec![GitCall {
            working_dir: None,
            args: vec!["--version".to_string()],
        }]
    );
}

#[test]
fn git_availability_returns_false_when_git_is_not_installed() {
    let runner = MockGitRunner::new([Err(MockGitError::NotFound)]);

    let availability = git_availability_with(&runner).expect("missing Git is a valid state");

    assert!(!availability.available);
    assert_eq!(availability.version, None);
}

#[test]
fn git_repository_detection_reports_a_non_repository_without_a_git_installation_assumption() {
    let root = temp_test_dir("git-non-repository");
    let runner = MockGitRunner::new([Ok(git_output(
        false,
        Some(128),
        "",
        "fatal: not a git repository",
    ))]);

    let repository =
        detect_git_repository_with(&runner, &root).expect("non-repository is a valid state");

    assert!(!repository.is_repository);
    assert_eq!(repository.branch, None);
    assert_eq!(
        runner.calls(),
        vec![GitCall {
            working_dir: Some(root.clone()),
            args: vec!["rev-parse".to_string(), "--is-inside-work-tree".to_string()],
        }]
    );
    fs::remove_dir_all(root).expect("temp non-repository directory is cleaned up");
}

#[test]
fn git_repository_detection_reports_the_current_branch_with_fixed_commands() {
    let root = temp_test_dir("git-repository");
    let runner = MockGitRunner::new([
        Ok(git_output(true, Some(0), "true\n", "")),
        Ok(git_output(true, Some(0), "main\n", "")),
    ]);

    let repository =
        detect_git_repository_with(&runner, &root).expect("repository detection succeeds");

    assert!(repository.is_repository);
    assert_eq!(repository.branch.as_deref(), Some("main"));
    assert_eq!(
        runner.calls(),
        vec![
            GitCall {
                working_dir: Some(root.clone()),
                args: vec!["rev-parse".to_string(), "--is-inside-work-tree".to_string()],
            },
            GitCall {
                working_dir: Some(root.clone()),
                args: vec![
                    "symbolic-ref".to_string(),
                    "--quiet".to_string(),
                    "--short".to_string(),
                    "HEAD".to_string(),
                ],
            },
        ]
    );
    fs::remove_dir_all(root).expect("temp repository directory is cleaned up");
}

#[test]
fn git_repository_detection_maps_missing_git_to_a_typed_error() {
    let root = temp_test_dir("git-missing");
    let runner = MockGitRunner::new([Err(MockGitError::NotFound)]);

    let error = detect_git_repository_with(&runner, &root)
        .expect_err("missing Git should explain why detection cannot run");

    assert_eq!(error.code, "git.not_installed");
    assert_eq!(
        error.message,
        "Git is not installed or is unavailable on PATH."
    );
    assert!(error.details.is_some());
    fs::remove_dir_all(root).expect("temp missing-Git directory is cleaned up");
}

#[test]
fn git_repository_initialization_uses_fixed_commands_then_returns_the_repository() {
    let root = temp_test_dir("git-initialize");
    let runner = MockGitRunner::new([
        // The initial repository check sees an ordinary folder.
        Ok(git_output(false, Some(128), "", "not a repository")),
        // Initialization succeeds without accepting workspace-controlled arguments.
        Ok(git_output(true, Some(0), "", "")),
        // Detection after initialization returns the new repository state.
        Ok(git_output(true, Some(0), "true", "")),
        Ok(git_output(true, Some(0), "main", "")),
    ]);

    let repository = initialize_git_repository_with(&runner, &root)
        .expect("Git initialization should return the new repository");

    assert!(repository.is_repository);
    assert_eq!(repository.branch.as_deref(), Some("main"));
    assert_eq!(
        runner.calls(),
        vec![
            GitCall {
                working_dir: Some(root.clone()),
                args: vec!["rev-parse".to_string(), "--is-inside-work-tree".to_string()],
            },
            GitCall {
                working_dir: Some(root.clone()),
                args: vec!["init".to_string(), "--quiet".to_string()],
            },
            GitCall {
                working_dir: Some(root.clone()),
                args: vec!["rev-parse".to_string(), "--is-inside-work-tree".to_string()],
            },
            GitCall {
                working_dir: Some(root.clone()),
                args: vec![
                    "symbolic-ref".to_string(),
                    "--quiet".to_string(),
                    "--short".to_string(),
                    "HEAD".to_string(),
                ],
            },
        ]
    );
    fs::remove_dir_all(root).expect("temp initialization directory is cleaned up");
}

#[test]
fn git_repository_initialization_returns_existing_repositories_without_running_init() {
    let root = temp_test_dir("git-initialize-existing");
    let runner = MockGitRunner::new([
        Ok(git_output(true, Some(0), "true", "")),
        Ok(git_output(true, Some(0), "main", "")),
    ]);

    let repository = initialize_git_repository_with(&runner, &root)
        .expect("existing repository should remain unchanged");

    assert!(repository.is_repository);
    assert_eq!(repository.branch.as_deref(), Some("main"));
    assert_eq!(
        runner.calls(),
        vec![
            GitCall {
                working_dir: Some(root.clone()),
                args: vec!["rev-parse".to_string(), "--is-inside-work-tree".to_string()],
            },
            GitCall {
                working_dir: Some(root.clone()),
                args: vec![
                    "symbolic-ref".to_string(),
                    "--quiet".to_string(),
                    "--short".to_string(),
                    "HEAD".to_string(),
                ],
            },
        ]
    );
    fs::remove_dir_all(root).expect("temp existing-repository directory is cleaned up");
}

#[test]
fn git_repository_initialization_maps_runner_and_git_failures_to_typed_errors() {
    let root = temp_test_dir("git-initialize-errors");
    let missing_git = MockGitRunner::new([
        Ok(git_output(false, Some(128), "", "not a repository")),
        Err(MockGitError::NotFound),
    ]);

    let missing_error = initialize_git_repository_with(&missing_git, &root)
        .expect_err("missing Git while initializing should be explicit");
    assert_eq!(missing_error.code, "git.not_installed");

    let timed_out = MockGitRunner::new([
        Ok(git_output(false, Some(128), "", "not a repository")),
        Err(MockGitError::TimedOut),
    ]);
    let timeout_error = initialize_git_repository_with(&timed_out, &root)
        .expect_err("timed out Git initialization should be explicit");
    assert_eq!(timeout_error.code, "git.command_timeout");

    let rejected = MockGitRunner::new([
        Ok(git_output(false, Some(128), "", "not a repository")),
        Ok(git_output(false, Some(2), "", "init rejected")),
    ]);
    let rejected_error = initialize_git_repository_with(&rejected, &root)
        .expect_err("failed Git initialization should be explicit");
    assert_eq!(rejected_error.code, "git.command_failed");
    assert!(rejected_error
        .details
        .unwrap_or_default()
        .contains("initialize the workspace Git repository"));

    fs::remove_dir_all(root).expect("temp initialization-error directory is cleaned up");
}

#[test]
fn git_status_uses_fixed_nul_delimited_porcelain_and_parses_all_path_kinds() {
    let root = temp_test_dir("git-status-mock");
    let runner = MockGitRunner::new([Ok(git_output(
        true,
        Some(0),
        // Rename and copy each include their source path after the
        // destination in porcelain v1's NUL-delimited form.
        " M modified.md\0A  staged.md\0?? untracked.md\0R  renamed.md\0old-name.md\0C  copied.md\0source.md\0",
        "",
    ))]);

    let entries = git_status_with(&runner, &root).expect("status parses");

    assert_eq!(
        entries,
        vec![
            GitStatusEntry {
                path: "copied.md".to_string(),
                index_status: "C".to_string(),
                worktree_status: " ".to_string(),
            },
            GitStatusEntry {
                path: "modified.md".to_string(),
                index_status: " ".to_string(),
                worktree_status: "M".to_string(),
            },
            GitStatusEntry {
                path: "renamed.md".to_string(),
                index_status: "R".to_string(),
                worktree_status: " ".to_string(),
            },
            GitStatusEntry {
                path: "staged.md".to_string(),
                index_status: "A".to_string(),
                worktree_status: " ".to_string(),
            },
            GitStatusEntry {
                path: "untracked.md".to_string(),
                index_status: "?".to_string(),
                worktree_status: "?".to_string(),
            },
        ]
    );
    assert_eq!(
        runner.calls(),
        vec![GitCall {
            working_dir: Some(root.clone()),
            args: vec![
                "status".to_string(),
                "--porcelain=v1".to_string(),
                "-z".to_string(),
                "--untracked-files=all".to_string(),
            ],
        }]
    );

    fs::remove_dir_all(root).expect("temp mock status directory is cleaned up");
}

#[test]
fn git_status_rejects_malformed_porcelain_with_a_typed_error() {
    let root = temp_test_dir("git-status-malformed");
    let runner = MockGitRunner::new([Ok(git_output(true, Some(0), "malformed\0", ""))]);

    let error = git_status_with(&runner, &root).expect_err("invalid output is rejected");

    assert_eq!(error.code, "git.command_failed");
    assert!(error
        .details
        .unwrap_or_default()
        .contains("invalid porcelain v1 output"));
    fs::remove_dir_all(root).expect("temp malformed status directory is cleaned up");
}

#[test]
fn git_index_updates_use_validated_paths_and_fixed_commands() {
    let root = temp_test_dir("git-index-mock");
    let runner = MockGitRunner::new([
        Ok(git_output(true, Some(0), "", "")),
        Ok(git_output(true, Some(0), "", "")),
    ]);
    let paths = vec!["Notes\\draft.md".to_string(), "todo.md".to_string()];

    stage_git_files_with(&runner, &root, &paths).expect("files stage");
    unstage_git_files_with(&runner, &root, &paths).expect("files unstage");

    assert_eq!(
        runner.calls(),
        vec![
            GitCall {
                working_dir: Some(root.clone()),
                args: vec![
                    "add".to_string(),
                    "--".to_string(),
                    "Notes/draft.md".to_string(),
                    "todo.md".to_string(),
                ],
            },
            GitCall {
                working_dir: Some(root.clone()),
                args: vec![
                    "reset".to_string(),
                    "--".to_string(),
                    "Notes/draft.md".to_string(),
                    "todo.md".to_string(),
                ],
            },
        ]
    );

    let invalid = MockGitRunner::new([]);
    let error = stage_git_files_with(&invalid, &root, &["../outside.md".to_string()])
        .expect_err("paths outside the workspace are rejected");
    assert_eq!(error.code, "workspace.invalid_path");
    assert!(invalid.calls().is_empty());

    fs::remove_dir_all(root).expect("temp index workspace is cleaned up");
}

#[test]
fn git_runner_errors_and_details_are_typed_and_bounded() {
    let root = temp_test_dir("git-timeout");
    let runner = MockGitRunner::new([Err(MockGitError::TimedOut)]);

    let error = detect_git_repository_with(&runner, &root)
        .expect_err("timed out Git detection should fail loudly");

    assert_eq!(error.code, "git.command_timeout");
    assert!(error
        .details
        .unwrap_or_default()
        .contains("detect the workspace"));
    assert_eq!(bounded_git_text(&"x".repeat(4_097)).chars().count(), 4_097);
    fs::remove_dir_all(root).expect("temp timeout directory is cleaned up");
}

#[test]
fn git_io_failures_are_reported_as_command_failures() {
    let runner = MockGitRunner::new([Err(MockGitError::Io)]);

    let error = git_availability_with(&runner).expect_err("I/O error should not be hidden");

    assert_eq!(error.code, "git.command_failed");
    assert!(error
        .details
        .unwrap_or_default()
        .contains("check the installed Git version"));
}

#[test]
fn system_git_detects_a_temp_non_repo_and_repo_when_git_is_available() {
    let runner = SystemGitRunner;
    let availability = git_availability_with(&runner).expect("Git availability command runs");

    // CI environments without Git still exercise all behavior through the
    // injected-runner tests above. This integration assertion runs only
    // when the host can safely create an isolated temporary repository.
    if !availability.available {
        return;
    }

    let root = temp_test_dir("system-git-repository");
    let non_repository =
        detect_git_repository_with(&runner, &root).expect("non-repository detection succeeds");
    assert!(!non_repository.is_repository);

    let initialized = Command::new("git")
        .args(["init", "--quiet"])
        .current_dir(&root)
        .stdin(std::process::Stdio::null())
        .output()
        .expect("Git initializes the isolated temporary repository");
    assert!(
        initialized.status.success(),
        "git init failed: {}",
        String::from_utf8_lossy(&initialized.stderr)
    );

    let repository =
        detect_git_repository_with(&runner, &root).expect("repository detection succeeds");
    assert!(repository.is_repository);
    assert!(repository.branch.is_some());

    fs::remove_dir_all(root).expect("temporary Git repository is cleaned up");
}

#[test]
fn system_git_initializes_an_isolated_workspace_when_available() {
    let runner = SystemGitRunner;
    let availability = git_availability_with(&runner).expect("Git availability command runs");

    if !availability.available {
        return;
    }

    let root = temp_test_dir("system-git-initialization");
    let repository = initialize_git_repository_with(&runner, &root)
        .expect("Git initializes an isolated temporary workspace");
    assert!(repository.is_repository);
    assert!(root.join(".git").is_dir());

    let repeat = initialize_git_repository_with(&runner, &root)
        .expect("repeated initialization is idempotent");
    assert!(repeat.is_repository);

    fs::remove_dir_all(root).expect("temporary initialized repository is cleaned up");
}

#[test]
fn system_git_stages_and_unstages_an_unborn_repository_when_available() {
    let runner = SystemGitRunner;
    let availability = git_availability_with(&runner).expect("Git availability command runs");

    if !availability.available {
        return;
    }

    let root = temp_test_dir("system-git-stage-unstage");
    initialize_git_repository_with(&runner, &root).expect("Git initializes the workspace");
    fs::write(root.join("draft.md"), "draft\n").expect("draft file is written");

    stage_git_files_with(&runner, &root, &["draft.md".to_string()]).expect("new file stages");
    let staged = git_status_with(&runner, &root).expect("staged status is available");
    assert_eq!(
        staged,
        vec![GitStatusEntry {
            path: "draft.md".to_string(),
            index_status: "A".to_string(),
            worktree_status: " ".to_string(),
        }]
    );

    unstage_git_files_with(&runner, &root, &["draft.md".to_string()])
        .expect("new file unstages without a HEAD commit");
    let unstaged = git_status_with(&runner, &root).expect("unstaged status is available");
    assert_eq!(
        unstaged,
        vec![GitStatusEntry {
            path: "draft.md".to_string(),
            index_status: "?".to_string(),
            worktree_status: "?".to_string(),
        }]
    );

    fs::remove_dir_all(root).expect("temporary stage workspace is cleaned up");
}

#[test]
fn system_git_status_reports_staged_modified_and_untracked_paths_when_available() {
    let runner = SystemGitRunner;
    let availability = git_availability_with(&runner).expect("Git availability command runs");

    if !availability.available {
        return;
    }

    let root = temp_test_dir("system-git-status");
    let initialize = Command::new("git")
        .args(["init", "--quiet"])
        .current_dir(&root)
        .stdin(std::process::Stdio::null())
        .output()
        .expect("Git initializes the isolated temporary repository");
    assert!(
        initialize.status.success(),
        "git init failed: {}",
        String::from_utf8_lossy(&initialize.stderr)
    );

    fs::write(root.join("modified.md"), "before\n").expect("baseline file is written");
    let add_baseline = Command::new("git")
        .args(["add", "modified.md"])
        .current_dir(&root)
        .stdin(std::process::Stdio::null())
        .output()
        .expect("baseline file stages");
    assert!(add_baseline.status.success());
    let commit = Command::new("git")
        .args([
            "-c",
            "user.name=Thinkbrain Tests",
            "-c",
            "user.email=tests@thinkbrain.invalid",
            "commit",
            "--quiet",
            "-m",
            "baseline",
        ])
        .current_dir(&root)
        .stdin(std::process::Stdio::null())
        .output()
        .expect("baseline commit succeeds");
    assert!(
        commit.status.success(),
        "git commit failed: {}",
        String::from_utf8_lossy(&commit.stderr)
    );

    fs::write(root.join("modified.md"), "after\n").expect("tracked file is modified");
    fs::write(root.join("staged.md"), "staged\n").expect("staged file is written");
    let add_staged = Command::new("git")
        .args(["add", "staged.md"])
        .current_dir(&root)
        .stdin(std::process::Stdio::null())
        .output()
        .expect("staged file stages");
    assert!(add_staged.status.success());
    fs::write(root.join("untracked.md"), "untracked\n").expect("untracked file is written");

    let entries = git_status_with(&runner, &root).expect("Git status succeeds");

    assert_eq!(
        entries,
        vec![
            GitStatusEntry {
                path: "modified.md".to_string(),
                index_status: " ".to_string(),
                worktree_status: "M".to_string(),
            },
            GitStatusEntry {
                path: "staged.md".to_string(),
                index_status: "A".to_string(),
                worktree_status: " ".to_string(),
            },
            GitStatusEntry {
                path: "untracked.md".to_string(),
                index_status: "?".to_string(),
                worktree_status: "?".to_string(),
            },
        ]
    );

    fs::remove_dir_all(root).expect("temporary Git status repository is cleaned up");
}

#[test]
fn native_error_shape_supports_optional_details() {
    let error = NativeError::with_details(
        "desktop.test_failure",
        "The test error is shaped consistently.",
        "extra context",
    );

    assert_eq!(error.code, "desktop.test_failure");
    assert_eq!(error.message, "The test error is shaped consistently.");
    assert_eq!(error.details.as_deref(), Some("extra context"));
}

#[test]
fn relative_paths_are_normalized_for_frontend_use() {
    assert_eq!(
        normalize_relative_path("folder\\note.md").expect("path should normalize"),
        "folder/note.md"
    );
}

#[test]
fn relative_paths_reject_workspace_escape() {
    let error = normalize_relative_path("../note.md").expect_err("path should be rejected");

    assert_eq!(error.code, "workspace.invalid_path");
}

#[test]
fn markdown_path_detection_accepts_markdown_extensions() {
    assert!(is_markdown_path(Path::new("note.md")));
    assert!(is_markdown_path(Path::new("note.MARKDOWN")));
    assert!(!is_markdown_path(Path::new("note.txt")));
}

#[test]
fn hidden_entries_are_dot_prefixed() {
    assert!(is_hidden_name(".git"));
    assert!(is_hidden_name(".obsidian"));
    assert!(!is_hidden_name("Notes"));
    assert!(!is_hidden_name("note.md"));
}

#[test]
fn search_matches_filename_body_tags_and_aliases() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[
            record(
                "projects/roadmap.md",
                "roadmap.md",
                Some("Quarterly Roadmap"),
                &["planning", "project"],
                &["Q3 Plan"],
                "Ship the indexer and search experience this quarter.",
            ),
            record(
                "daily/inbox.md",
                "inbox.md",
                Some("Inbox"),
                &["capture"],
                &[],
                "Loose notes about kombucha brewing.",
            ),
        ],
    )
    .expect("documents index");

    // Filename match.
    assert_eq!(
        result_paths(&connection, "roadmap"),
        vec!["projects/roadmap.md"]
    );
    // Body match.
    assert_eq!(
        result_paths(&connection, "kombucha"),
        vec!["daily/inbox.md"]
    );
    // Tag match.
    assert_eq!(
        result_paths(&connection, "planning"),
        vec!["projects/roadmap.md"]
    );
    // Alias match.
    assert_eq!(result_paths(&connection, "Q3"), vec!["projects/roadmap.md"]);
    // Title match.
    assert_eq!(
        result_paths(&connection, "quarterly"),
        vec!["projects/roadmap.md"]
    );
}

#[test]
fn search_supports_prefix_matching_for_type_ahead() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[record(
            "notes/linguistics.md",
            "linguistics.md",
            None,
            &[],
            &[],
            "Phonology and morphology overview.",
        )],
    )
    .expect("document indexes");

    assert_eq!(
        result_paths(&connection, "ling"),
        vec!["notes/linguistics.md"]
    );
    assert_eq!(
        result_paths(&connection, "phon"),
        vec!["notes/linguistics.md"]
    );
}

#[test]
fn rebuild_replaces_previous_index_contents() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[record(
            "old.md",
            "old.md",
            None,
            &[],
            &[],
            "obsolete content",
        )],
    )
    .expect("first index");

    clear_documents(&connection).expect("index clears");
    index_document_records(
        &mut connection,
        &[record("new.md", "new.md", None, &[], &[], "fresh content")],
    )
    .expect("rebuild");

    assert!(result_paths(&connection, "obsolete").is_empty());
    assert_eq!(result_paths(&connection, "fresh"), vec!["new.md"]);
}

#[test]
fn deleting_a_document_removes_it_from_search() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[record(
            "removable.md",
            "removable.md",
            None,
            &[],
            &[],
            "delete me",
        )],
    )
    .expect("document indexes");

    delete_document(&connection, "removable.md").expect("document deletes");

    assert!(result_paths(&connection, "delete").is_empty());
}

#[test]
fn malformed_and_empty_queries_do_not_panic_or_error() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[record(
            "safe.md",
            "safe.md",
            None,
            &[],
            &[],
            "harmless body text",
        )],
    )
    .expect("document indexes");

    // Empty / whitespace-only input yields no results without touching SQLite.
    assert!(build_fts_match_query("   ").is_none());
    assert!(search_documents(&connection, "", 50)
        .expect("empty query is safe")
        .is_empty());

    // FTS5 special syntax must be neutralized rather than raising an error.
    for malformed in ["\"", "*", "AND OR", "tag:", "(unbalanced", "a -b \"c"] {
        search_documents(&connection, malformed, 50)
            .unwrap_or_else(|error| panic!("query {malformed:?} should not error: {error}"));
    }
}

#[test]
fn workspace_hash_is_stable_and_path_specific() {
    assert_eq!(
        stable_workspace_hash("/home/user/vault"),
        stable_workspace_hash("/home/user/vault")
    );
    assert_ne!(
        stable_workspace_hash("/home/user/vault"),
        stable_workspace_hash("/home/user/other-vault")
    );
}

#[test]
fn settings_paths_stay_under_app_data() {
    let app_data_dir = PathBuf::from("/tmp/thinkbrain-app-data");
    let workspace_root = PathBuf::from("/tmp/user-vault");

    let app_path = app_settings_path(&app_data_dir);
    let workspace_path = workspace_settings_path(&app_data_dir, &workspace_root);
    let expected_workspace_file_name = format!(
        "workspace-{:016x}.json",
        stable_workspace_hash(&workspace_root.to_string_lossy())
    );

    assert_eq!(app_path, app_data_dir.join("settings").join("app.json"));
    assert!(workspace_path.starts_with(app_data_dir.join("settings")));
    assert!(!workspace_path.starts_with(&workspace_root));
    assert_eq!(
        workspace_path.file_name().and_then(|name| name.to_str()),
        Some(expected_workspace_file_name.as_str())
    );
}

#[test]
fn settings_read_returns_none_when_file_is_absent() {
    let settings_path = temp_test_dir("missing").join("settings").join("app.json");

    assert_eq!(
        read_settings_file(&settings_path).expect("missing settings read succeeds"),
        None
    );
}

#[test]
fn settings_write_creates_parent_directory_and_round_trips() {
    let temp_dir = temp_test_dir("write");
    let settings_path = temp_dir.join("settings").join("app.json");
    let contents = "{\n  \"version\": 1\n}\n";

    write_settings_file(&settings_path, contents).expect("settings write succeeds");

    assert_eq!(
        read_settings_file(&settings_path).expect("settings read succeeds"),
        Some(contents.to_string())
    );

    fs::remove_dir_all(temp_dir).expect("temp settings directory is cleaned up");
}

#[test]
fn desktop_state_update_merges_concurrent_mrus_and_preserves_app_settings() {
    let temp_dir = temp_test_dir("state_merge");
    let one = temp_dir.join("one");
    let two = temp_dir.join("two");
    let legacy = temp_dir.join("legacy");
    std::fs::create_dir_all(&one).unwrap();
    std::fs::create_dir_all(&two).unwrap();
    std::fs::create_dir_all(&legacy).unwrap();

    let one_path = crate::commands::workspace::resolve_workspace_root(&one.to_string_lossy()).unwrap().to_string_lossy().to_string();
    let two_path = crate::commands::workspace::resolve_workspace_root(&two.to_string_lossy()).unwrap().to_string_lossy().to_string();
    let legacy_path = crate::commands::workspace::resolve_workspace_root(&legacy.to_string_lossy()).unwrap().to_string_lossy().to_string();

    let first_json = serde_json::json!({
        "theme": "dark",
        "extensionSettings": { "timer": { "enabled": true } },
        "lastWorkspacePath": legacy_path,
        "explorerOpen": false
    });

    let first = update_desktop_state_contents(
        Some(&first_json.to_string()),
        DesktopStateUpdate {
            last_workspace_path: Some(Some(one_path.clone())),
            recent_workspace_paths: Some(vec![
                one_path.clone(),
                legacy_path.clone(),
            ]),
            left_panel_width: Some(352.0),
            bottom_panel_open: Some(true),
            ..Default::default()
        },
    )
    .expect("first desktop-state update succeeds");
    
    let second = update_desktop_state_contents(
        Some(&first),
        DesktopStateUpdate {
            recent_workspace_paths: Some(vec![
                two_path.clone(),
                legacy_path.clone(),
            ]),
            explorer_open: Some(true),
            right_panel_width: Some(512.0),
            ..Default::default()
        },
    )
    .expect("second desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&second).expect("serialized settings are valid");
    assert_eq!(settings["theme"], serde_json::json!("dark"));
    assert_eq!(
        settings["extensionSettings"]["timer"]["enabled"],
        serde_json::json!(true)
    );
    assert!(settings.get("lastWorkspacePath").is_none());
    assert!(settings.get("explorerOpen").is_none());
    assert_eq!(
        settings["desktopState"],
        serde_json::json!({
            "version": 4,
            "lastWorkspacePath": one_path,
            "recentWorkspacePaths": [two_path, legacy_path, one_path],
            "explorerOpen": true,
            "leftPanelWidth": 352.0,
            "rightPanelWidth": 480.0,
            "bottomPanelOpen": true,
            "developmentExtensionDirectories": [],
            "openTabs": [],
            "activeTabId": null
        })
    );
}

#[test]
fn desktop_state_persists_development_extension_directories_verbatim() {
    // Directories are stored as given — not canonicalized — so a directory
    // that is temporarily missing stays in the list instead of vanishing.
    let stored = update_desktop_state_contents(
        None,
        DesktopStateUpdate {
            development_extension_directories: Some(vec![
                "/ext/one".to_string(),
                "".to_string(),
                "/ext/two".to_string(),
                "/ext/one".to_string(),
            ]),
            ..Default::default()
        },
    )
    .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&stored).expect("serialized settings are valid");
    assert_eq!(
        settings["desktopState"]["developmentExtensionDirectories"],
        serde_json::json!(["/ext/one", "/ext/two"])
    );

    // An update that does not mention the field keeps the stored list.
    let unchanged = update_desktop_state_contents(
        Some(&stored),
        DesktopStateUpdate {
            explorer_open: Some(true),
            ..Default::default()
        },
    )
    .expect("unrelated desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&unchanged).expect("serialized settings are valid");
    assert_eq!(
        settings["desktopState"]["developmentExtensionDirectories"],
        serde_json::json!(["/ext/one", "/ext/two"])
    );
}

#[test]
fn desktop_state_without_extension_directories_defaults_to_empty() {
    let existing = serde_json::json!({
        "desktopState": { "version": 3, "explorerOpen": true }
    });

    let updated = update_desktop_state_contents(
        Some(&existing.to_string()),
        DesktopStateUpdate::default(),
    )
    .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&updated).expect("serialized settings are valid");
    assert_eq!(
        settings["desktopState"]["developmentExtensionDirectories"],
        serde_json::json!([])
    );
}

#[test]
fn desktop_state_active_tab_id_explicit_null_clears_instead_of_restoring_current() {
    // Mirrors `last_workspace_path`'s `Some(None)`-clears semantics: an
    // explicit null must clear the active tab rather than keep the old one.
    let stored = update_desktop_state_contents(
        None,
        DesktopStateUpdate {
            active_tab_id: Some(Some("tab-1".to_string())),
            ..Default::default()
        },
    )
    .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&stored).expect("serialized settings are valid");
    assert_eq!(settings["desktopState"]["activeTabId"], serde_json::json!("tab-1"));

    let cleared = update_desktop_state_contents(
        Some(&stored),
        DesktopStateUpdate {
            active_tab_id: Some(None),
            ..Default::default()
        },
    )
    .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&cleared).expect("serialized settings are valid");
    assert_eq!(settings["desktopState"]["activeTabId"], Value::Null);

    // An update that omits the field entirely keeps the current value.
    let restored = update_desktop_state_contents(
        Some(&stored),
        DesktopStateUpdate::default(),
    )
    .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&restored).expect("serialized settings are valid");
    assert_eq!(settings["desktopState"]["activeTabId"], serde_json::json!("tab-1"));
}

#[test]
fn app_theme_update_replaces_theme_and_preserves_other_settings() {
    let existing = serde_json::json!({
        "version": 1,
        "theme": "system",
        "editor": { "fontSize": 18, "lineWrapping": false },
        "extensionSettings": { "timer": { "enabled": true } },
        "desktopState": {
            "version": 2,
            "lastWorkspacePath": "/notes/vault",
            "recentWorkspacePaths": ["/notes/vault"],
            "explorerOpen": false
        }
    });

    let updated = update_app_theme_contents(Some(&existing.to_string()), "dark")
        .expect("theme update succeeds");

    // The document keeps the canonical on-disk shape (pretty JSON + newline).
    assert!(updated.ends_with("}\n"));

    let settings: Value = serde_json::from_str(&updated).expect("serialized settings are valid");
    assert_eq!(settings["theme"], serde_json::json!("dark"));
    assert_eq!(settings["version"], serde_json::json!(1));
    assert_eq!(
        settings["editor"],
        serde_json::json!({ "fontSize": 18, "lineWrapping": false })
    );
    assert_eq!(
        settings["extensionSettings"]["timer"]["enabled"],
        serde_json::json!(true)
    );
    assert_eq!(settings["desktopState"], existing["desktopState"]);

    // A missing settings file still yields a valid document with only the theme.
    let created = update_app_theme_contents(None, "light").expect("theme update seeds settings");
    let created_settings: Value = serde_json::from_str(&created).expect("seeded settings are valid");
    assert_eq!(created_settings, serde_json::json!({ "theme": "light" }));

    for theme in ["system", "light", "dark"] {
        let round_trip =
            update_app_theme_contents(Some(&updated), theme).expect("supported theme is accepted");
        let round_trip_settings: Value =
            serde_json::from_str(&round_trip).expect("serialized settings are valid");
        assert_eq!(round_trip_settings["theme"], serde_json::json!(theme));
    }

    // Unsupported themes fail loudly instead of writing an unusable document.
    for invalid in ["", "neon", "Dark", "high-contrast"] {
        let error = update_app_theme_contents(Some(&updated), invalid)
            .expect_err("unsupported theme is rejected");
        assert_eq!(error.code, "settings.invalid_theme");
    }
}

#[test]
fn create_workspace_file_creates_missing_parents_and_writes_contents() {
    let root = temp_test_dir("create-file");
    let entry = create_workspace_file(
        root.to_string_lossy().to_string(),
        "Notes/welcome.md".to_string(),
        Some("# Hello".to_string()),
    )
    .expect("workspace file is created");

    assert_eq!(entry.name, "welcome.md");
    assert_eq!(entry.parent_path, "Notes");
    assert_eq!(entry.kind, "file");
    assert!(entry.is_markdown);
    assert_eq!(
        fs::read_to_string(root.join("Notes").join("welcome.md")).expect("file is readable"),
        "# Hello"
    );

    // A second create at the same path fails loudly so the UI can surface it.
    let conflict = create_workspace_file(
        root.to_string_lossy().to_string(),
        "Notes/welcome.md".to_string(),
        None,
    );
    assert!(conflict.is_err());
    assert_eq!(conflict.unwrap_err().code, "workspace.file_exists");
    assert_eq!(
        fs::read_to_string(root.join("Notes").join("welcome.md"))
            .expect("existing file is unchanged"),
        "# Hello"
    );

    fs::remove_dir_all(root).expect("temp create-file directory is cleaned up");
}

#[test]
fn create_workspace_folder_creates_nested_directories() {
    let root = temp_test_dir("create-folder");
    let entry = create_workspace_folder(
        root.to_string_lossy().to_string(),
        "Archive/2024/January".to_string(),
    )
    .expect("workspace folder is created");

    assert_eq!(entry.kind, "directory");
    assert_eq!(entry.relative_path, "Archive/2024/January");
    assert!(root.join("Archive").join("2024").join("January").is_dir());

    let conflict = create_workspace_folder(
        root.to_string_lossy().to_string(),
        "Archive/2024/January".to_string(),
    );
    assert!(conflict.is_err());
    assert_eq!(conflict.unwrap_err().code, "workspace.file_exists");

    fs::remove_dir_all(root).expect("temp create-folder directory is cleaned up");
}

#[test]
fn rename_workspace_entry_moves_files_and_creates_destination_parents() {
    let root = temp_test_dir("rename-entry");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "draft.md".to_string(),
        Some("body".to_string()),
    )
    .expect("source file is created");

    let renamed = rename_workspace_entry(
        root.to_string_lossy().to_string(),
        "draft.md".to_string(),
        "Archive/draft.md".to_string(),
    )
    .expect("rename succeeds");

    assert_eq!(renamed.relative_path, "Archive/draft.md");
    assert!(!root.join("draft.md").exists());
    assert!(root.join("Archive").join("draft.md").is_file());

    // Renaming a missing entry fails loudly.
    let missing = rename_workspace_entry(
        root.to_string_lossy().to_string(),
        "ghost.md".to_string(),
        "Archive/ghost.md".to_string(),
    );
    assert!(missing.is_err());
    assert_eq!(missing.unwrap_err().code, "workspace.file_missing");

    // Renaming onto an existing entry fails loudly.
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "other.md".to_string(),
        None,
    )
    .expect("destination file is created");
    let collision = rename_workspace_entry(
        root.to_string_lossy().to_string(),
        "Archive/draft.md".to_string(),
        "other.md".to_string(),
    );
    assert!(collision.is_err());
    assert_eq!(collision.unwrap_err().code, "workspace.file_exists");

    fs::remove_dir_all(root).expect("temp rename-entry directory is cleaned up");
}

#[test]
fn delete_workspace_entry_removes_files_and_folders_recursively() {
    let root = temp_test_dir("delete-entry");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "Folder/nested.md".to_string(),
        Some("body".to_string()),
    )
    .expect("nested file is created");

    delete_workspace_entry(root.to_string_lossy().to_string(), "Folder".to_string())
        .expect("folder is deleted recursively");

    assert!(!root.join("Folder").exists());

    let missing =
        delete_workspace_entry(root.to_string_lossy().to_string(), "Folder".to_string());
    assert!(missing.is_err());
    assert_eq!(missing.unwrap_err().code, "workspace.file_missing");

    fs::remove_dir_all(root).expect("temp delete-entry directory is cleaned up");
}

#[test]
fn workspace_entry_commands_reject_paths_that_escape_the_workspace_root() {
    let root = temp_test_dir("entry-escape");

    let create_file_escape = create_workspace_file(
        root.to_string_lossy().to_string(),
        "../outside.md".to_string(),
        None,
    );
    assert!(create_file_escape.is_err());
    assert_eq!(
        create_file_escape.unwrap_err().code,
        "workspace.invalid_path"
    );

    let create_folder_escape =
        create_workspace_folder(root.to_string_lossy().to_string(), "../outside".to_string());
    assert!(create_folder_escape.is_err());
    assert_eq!(
        create_folder_escape.unwrap_err().code,
        "workspace.invalid_path"
    );

    let rename_source_escape = rename_workspace_entry(
        root.to_string_lossy().to_string(),
        "../outside.md".to_string(),
        "renamed.md".to_string(),
    );
    assert!(rename_source_escape.is_err());
    assert_eq!(
        rename_source_escape.unwrap_err().code,
        "workspace.invalid_path"
    );

    fs::write(root.join("source.md"), "body").expect("rename source is created");
    let rename_destination_escape = rename_workspace_entry(
        root.to_string_lossy().to_string(),
        "source.md".to_string(),
        "../outside.md".to_string(),
    );
    assert!(rename_destination_escape.is_err());
    assert_eq!(
        rename_destination_escape.unwrap_err().code,
        "workspace.invalid_path"
    );
    assert!(root.join("source.md").exists());

    let delete_escape = delete_workspace_entry(
        root.to_string_lossy().to_string(),
        "../outside.md".to_string(),
    );
    assert!(delete_escape.is_err());
    assert_eq!(delete_escape.unwrap_err().code, "workspace.invalid_path");

    fs::remove_dir_all(root).expect("temp entry-escape directory is cleaned up");
}

#[cfg(unix)]
#[test]
fn workspace_entry_commands_reject_symlink_escapes_via_canonicalization() {
    use std::os::unix::fs::symlink;

    let root = temp_test_dir("entry-symlink");
    let outside = temp_test_dir("entry-symlink-outside");
    symlink(&outside, root.join("escape")).expect("symlink is created");

    // Creating a file through the symlink would write outside the workspace.
    let attempt = create_workspace_file(
        root.to_string_lossy().to_string(),
        "escape/stolen.md".to_string(),
        None,
    );
    assert!(attempt.is_err());
    assert_eq!(attempt.unwrap_err().code, "workspace.invalid_path");
    assert!(!outside.join("stolen.md").exists());

    // Deleting through the symlink would delete outside the workspace.
    fs::write(outside.join("target.md"), "body").expect("outside file is created");
    let delete_attempt = delete_workspace_entry(
        root.to_string_lossy().to_string(),
        "escape/target.md".to_string(),
    );
    assert!(delete_attempt.is_err());
    assert_eq!(delete_attempt.unwrap_err().code, "workspace.invalid_path");
    assert!(outside.join("target.md").exists());

    fs::remove_dir_all(root).expect("temp symlink root is cleaned up");
    fs::remove_dir_all(outside).expect("temp symlink outside directory is cleaned up");
}

#[test]
fn rename_workspace_entry_treats_source_equal_destination_as_a_noop() {
    let root = temp_test_dir("rename-noop");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "draft.md".to_string(),
        Some("body".to_string()),
    )
    .expect("source file is created");

    // Same relative path on both sides: succeed without touching the file.
    let result = rename_workspace_entry(
        root.to_string_lossy().to_string(),
        "draft.md".to_string(),
        "draft.md".to_string(),
    )
    .expect("no-op rename succeeds");
    assert_eq!(result.relative_path, "draft.md");
    assert_eq!(
        fs::read_to_string(root.join("draft.md")).expect("file is unchanged"),
        "body"
    );

    fs::remove_dir_all(root).expect("temp rename-noop directory is cleaned up");
}

#[cfg(unix)]
#[test]
fn markdown_commands_reject_symlink_escapes_from_the_workspace() {
    use std::os::unix::fs::symlink;

    let root = temp_test_dir("markdown-symlink");
    let outside = temp_test_dir("markdown-symlink-outside");
    let secret = outside.join("secret.md");
    fs::write(&secret, "outside the vault").expect("outside file is written");

    // A vault can legitimately contain symlinks — synced from another machine,
    // or shipped inside a shared/downloaded vault. Following one out of the
    // workspace would read and overwrite files the workspace never covered.
    symlink(&secret, root.join("innocent.md")).expect("symlink is created");

    let read_escape = read_markdown_file(
        root.to_string_lossy().to_string(),
        "innocent.md".to_string(),
    );
    assert!(read_escape.is_err(), "reading through a symlink must be refused");
    assert_eq!(read_escape.unwrap_err().code, "workspace.invalid_path");

    assert_eq!(
        fs::read_to_string(&secret).expect("outside file still readable"),
        "outside the vault",
        "the outside file must not have been touched"
    );

    fs::remove_dir_all(root).expect("temp markdown symlink root is cleaned up");
    fs::remove_dir_all(outside).expect("temp markdown symlink outside dir is cleaned up");
}

#[test]
fn workspace_settings_write_is_refused_when_the_file_moved_underneath_it() {
    // Another window wrote between this window's read and its write, so the
    // document it revised is no longer the one on disk.
    assert!(check_workspace_settings_precondition(
        Some("{\"showHidden\":true}"),
        Some("{\"fieldDefinitions\":[]}")
    )
    .is_err());

    // Nobody interfered.
    assert!(check_workspace_settings_precondition(
        Some("{\"showHidden\":true}"),
        Some("{\"showHidden\":true}")
    )
    .is_ok());
}

#[test]
fn workspace_settings_write_treats_an_absent_file_as_a_precondition_of_its_own() {
    // The first writer read nothing and expects to still find nothing.
    assert!(check_workspace_settings_precondition(None, None).is_ok());

    // A file appeared where this writer saw none.
    assert!(check_workspace_settings_precondition(Some("{}"), None).is_err());

    // The file this writer read has since been removed.
    assert!(check_workspace_settings_precondition(None, Some("{}")).is_err());
}

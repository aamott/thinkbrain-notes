use crate::error::NativeError;
use serde::Serialize;
use std::path::Path;

use std::process::{Command, Output, Stdio};
use crate::commands::workspace::{resolve_workspace_root, WORKSPACE_ENTRY_MUTATION_LOCK, resolve_workspace_entry_path};

mod porcelain;
#[allow(unused_imports)]
pub use porcelain::{
    bounded_git_text, git_command_failed, git_run_error, git_status_parse_error,
    non_empty_git_text, parse_git_status_porcelain_v1,
};


const GIT_COMMAND_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
const MAX_GIT_DETAILS_LENGTH: usize = 4_096;

/// The system Git installation available to the desktop app.
///
/// `available` is deliberately a value rather than an error: the UI needs to
/// render a useful disabled state when Git is absent. Other Git commands use a
/// typed `git.not_installed` error if the binary disappears after this check.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GitAvailability {
    pub available: bool,
    pub version: Option<String>,
}


/// Read-only Git repository information for an opened workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GitRepository {
    pub is_repository: bool,
    pub branch: Option<String>,
}


/// One entry from Git's machine-readable porcelain v1 status output.
///
/// The status codes are the two fixed-width porcelain fields. A space means
/// Git reports no change for that area; `?` marks an untracked path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GitStatusEntry {
    pub path: String,
    pub index_status: String,
    pub worktree_status: String,
}


/// Reports whether a usable system `git` binary is available on PATH.
///
/// This command never treats a missing Git binary as an exceptional result so
/// the frontend can gate source-control affordances without error handling.
#[tauri::command]
pub fn git_availability() -> Result<GitAvailability, NativeError> {
    git_availability_with(&SystemGitRunner)
}


/// Detects whether an opened workspace is inside a Git work tree and, when
/// available, reports its current symbolic branch.
///
/// The command is read-only. It executes exact, non-shell Git subcommands in
/// the already canonicalized workspace directory, with no stdin or pager.
#[tauri::command]
pub fn detect_git_repository(root_path: String) -> Result<GitRepository, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    detect_git_repository_with(&SystemGitRunner, &root)
}


/// Initializes the opened workspace as a Git repository when it is not
/// already one, then returns the resulting repository state.
///
/// The command first uses the same read-only detection used by the source
/// control UI. That makes repeated requests idempotent: an existing
/// repository is returned unchanged and `git init` is not run again.
#[tauri::command]
pub fn initialize_git_repository(root_path: String) -> Result<GitRepository, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    initialize_git_repository_with(&SystemGitRunner, &root)
}


/// Returns the current Git status for an opened workspace.
///
/// This uses porcelain v1 with NUL delimiters so filenames are never parsed
/// through human-oriented quoting rules. The command is read-only and uses
/// only fixed arguments; the workspace root is the process working directory.
#[tauri::command]
pub fn git_status(root_path: String) -> Result<Vec<GitStatusEntry>, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    git_status_with(&SystemGitRunner, &root)
}


/// Stages the supplied workspace-relative paths with Git.
///
/// Every path is normalized before it is passed to Git, and `--` terminates
/// fixed Git options so a filename can never be interpreted as an argument.
#[tauri::command]
pub fn stage_git_files(root_path: String, paths: Vec<String>) -> Result<(), NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    stage_git_files_with(&SystemGitRunner, &root, &paths)
}


/// Removes the supplied workspace-relative paths from Git's staging area.
#[tauri::command]
pub fn unstage_git_files(root_path: String, paths: Vec<String>) -> Result<(), NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    unstage_git_files_with(&SystemGitRunner, &root, &paths)
}


#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitCommandOutput {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}


#[derive(Debug)]
pub enum GitRunError {
    NotFound(std::io::Error),
    TimedOut,
    Io(std::io::Error),
}


pub trait GitRunner {
    /// Runs one fixed Git command. `working_dir` is only used as a process
    /// current directory; workspace paths are never interpolated into shell
    /// strings or passed as Git arguments.
    fn run(
        &self,
        working_dir: Option<&Path>,
        args: &[&str],
    ) -> Result<GitCommandOutput, GitRunError>;
}


pub struct SystemGitRunner;

impl GitRunner for SystemGitRunner {
    fn run(
        &self,
        working_dir: Option<&Path>,
        args: &[&str],
    ) -> Result<GitCommandOutput, GitRunError> {
        let mut command = Command::new("git");
        command
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // These commands are non-interactive. The explicit environment
            // prevents a credential prompt or pager from keeping a desktop
            // command alive.
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_PAGER", "cat")
            .env("GIT_OPTIONAL_LOCKS", "0");

        if let Some(directory) = working_dir {
            command.current_dir(directory);
        }

        let child = command.spawn().map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                GitRunError::NotFound(error)
            } else {
                GitRunError::Io(error)
            }
        })?;

        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(child.wait_with_output());
        });

        match rx.recv_timeout(GIT_COMMAND_TIMEOUT) {
            Ok(Ok(output)) => Ok(git_command_output(output)),
            Ok(Err(e)) => Err(GitRunError::Io(e)),
            Err(_) => Err(GitRunError::TimedOut),
        }
    }
}


pub fn git_command_output(output: Output) -> GitCommandOutput {
    GitCommandOutput {
        success: output.status.success(),
        exit_code: output.status.code(),
        // Preserve leading whitespace: porcelain status uses the first two
        // bytes for its index/worktree codes, including a meaningful space.
        // Callers that consume line-oriented Git output trim it explicitly.
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    }
}


pub fn git_availability_with(runner: &impl GitRunner) -> Result<GitAvailability, NativeError> {
    match runner.run(None, &["--version"]) {
        Ok(output) if output.success => Ok(GitAvailability {
            available: true,
            version: non_empty_git_text(&output.stdout),
        }),
        Ok(output) => Err(git_command_failed(
            "check the installed Git version",
            &output,
        )),
        Err(GitRunError::NotFound(_)) => Ok(GitAvailability {
            available: false,
            version: None,
        }),
        Err(error) => Err(git_run_error("check the installed Git version", error)),
    }
}


pub fn detect_git_repository_with(
    runner: &impl GitRunner,
    root: &Path,
) -> Result<GitRepository, NativeError> {
    let repository_check = runner
        .run(Some(root), &["rev-parse", "--is-inside-work-tree"])
        .map_err(|error| git_run_error("detect the workspace Git repository", error))?;

    // `rev-parse` uses a non-zero status for ordinary non-repositories. It is
    // the expected negative result for this detection API, not an operation
    // failure. Any later mutation command can instead surface git.not_repo.
    if !repository_check.success || repository_check.stdout.trim() != "true" {
        return Ok(GitRepository {
            is_repository: false,
            branch: None,
        });
    }

    let branch = runner
        .run(Some(root), &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .map_err(|error| git_run_error("read the workspace Git branch", error))?;

    if branch.success {
        return Ok(GitRepository {
            is_repository: true,
            branch: non_empty_git_text(&branch.stdout),
        });
    }

    // Exit status 1 is Git's documented detached-HEAD/no-symbolic-branch
    // signal for `symbolic-ref --quiet`; the workspace is still a repository.
    if branch.exit_code == Some(1) {
        return Ok(GitRepository {
            is_repository: true,
            branch: None,
        });
    }

    Err(git_command_failed("read the workspace Git branch", &branch))
}


pub fn initialize_git_repository_with(
    runner: &impl GitRunner,
    root: &Path,
) -> Result<GitRepository, NativeError> {
    let _mutation_lock = WORKSPACE_ENTRY_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    let existing_repository = detect_git_repository_with(runner, root)?;

    if existing_repository.is_repository {
        return Ok(existing_repository);
    }

    let initialization = runner
        .run(Some(root), &["init", "--quiet"])
        .map_err(|error| git_run_error("initialize the workspace Git repository", error))?;

    if !initialization.success {
        return Err(git_command_failed(
            "initialize the workspace Git repository",
            &initialization,
        ));
    }

    detect_git_repository_with(runner, root)
}


pub fn git_status_with(
    runner: &impl GitRunner,
    root: &Path,
) -> Result<Vec<GitStatusEntry>, NativeError> {
    let status = runner
        .run(
            Some(root),
            &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        )
        .map_err(|error| git_run_error("read the workspace Git status", error))?;

    if !status.success {
        return Err(git_command_failed("read the workspace Git status", &status));
    }

    parse_git_status_porcelain_v1(&status.stdout)
}


pub fn stage_git_files_with(
    runner: &impl GitRunner,
    root: &Path,
    paths: &[String],
) -> Result<(), NativeError> {
    update_git_index_with(runner, root, paths, "stage", &["add"])
}


pub fn unstage_git_files_with(
    runner: &impl GitRunner,
    root: &Path,
    paths: &[String],
) -> Result<(), NativeError> {
    // `git reset -- <paths>` works for both an initialized repository and an
    // unborn branch, unlike an explicit `HEAD` pathspec.
    update_git_index_with(runner, root, paths, "unstage", &["reset"])
}


pub fn update_git_index_with(
    runner: &impl GitRunner,
    root: &Path,
    paths: &[String],
    action: &str,
    command: &[&str],
) -> Result<(), NativeError> {
    if paths.is_empty() {
        return Err(NativeError::new(
            "git.no_paths",
            "Select at least one workspace file.",
        ));
    }

    let _mutation_lock = WORKSPACE_ENTRY_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    let paths = paths
        .iter()
        .map(|path| {
            let absolute = resolve_workspace_entry_path(root, path)?;
            absolute.strip_prefix(root).map(|p| p.to_string_lossy().into_owned().replace('\\', "/")).map_err(|_| {
                NativeError::new("git.invalid_path", "Path outside workspace")
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    for chunk in paths.chunks(100) {
        let mut args = command.to_vec();
        args.push("--");
        args.extend(chunk.iter().map(String::as_str));

        let output = runner
            .run(Some(root), &args)
            .map_err(|error| git_run_error(&format!("{action} workspace files"), error))?;

        if !output.success {
            return Err(git_command_failed(
                &format!("{action} workspace files"),
                &output,
            ));
        }
    }

    Ok(())
}



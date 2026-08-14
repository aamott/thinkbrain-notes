//! Git porcelain v1 status parser and shared Git error/text helpers.
//!
//! Split out of `git/mod.rs` so the IPC commands and runner trait live in one
//! file and the pure parser + output-formatting helpers live in another. The
//! parser is a pure function on a string; the helpers here are shared by both
//! the runner/operations in `mod.rs` and the parser in this file.

use crate::error::NativeError;
use super::{GitCommandOutput, GitRunError, GitStatusEntry, MAX_GIT_DETAILS_LENGTH};


/// Parses Git's `status --porcelain=v1 -z` output.
///
/// A normal record is `XY path\0`. Rename and copy records include a second
/// NUL-delimited source path after the destination path; this API exposes the
/// destination path because it is the path that now exists in the workspace.
pub fn parse_git_status_porcelain_v1(output: &str) -> Result<Vec<GitStatusEntry>, NativeError> {
    let records: Vec<&str> = output.split('\0').collect();
    let mut entries = Vec::new();
    let mut record_index = 0;

    while record_index < records.len() {
        let record = records[record_index];
        if record.is_empty() {
            record_index += 1;
            continue;
        }

        let bytes = record.as_bytes();

        if bytes.len() < 4 || bytes[2] != b' ' {
            return Err(git_status_parse_error("a record did not contain `XY path`"));
        }

        let path = &record[3..];
        if path.is_empty() {
            return Err(git_status_parse_error("a record did not include a path"));
        }

        let index_status = record[0..1].to_string();
        let worktree_status = record[1..2].to_string();
        // Validate the two status bytes against porcelain v1's legal codes so a
        // corrupted/truncated stdout fails loudly here instead of forwarding a
        // bogus two-character status to the frontend. `?` is only legal when
        // both positions are `?` (an untracked path); `!` only appears in
        // ignored-output mode which this command does not request.
        if !is_valid_status_pair(bytes[0], bytes[1]) {
            return Err(git_status_parse_error(&format!(
                "a record used an unknown status code `{}`",
                &record[0..2]
            )));
        }
        let has_source_path = matches!(index_status.as_str(), "R" | "C")
            || matches!(worktree_status.as_str(), "R" | "C");

        if has_source_path {
            record_index += 1;
            let Some(source_path) = records.get(record_index) else {
                return Err(git_status_parse_error(
                    "a rename or copy record did not include its source path",
                ));
            };

            if source_path.is_empty() {
                return Err(git_status_parse_error(
                    "a rename or copy record included an empty source path",
                ));
            }
        }

        entries.push(GitStatusEntry {
            path: path.to_string(),
            index_status,
            worktree_status,
        });
        record_index += 1;
    }

    entries.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then_with(|| left.index_status.cmp(&right.index_status))
            .then_with(|| left.worktree_status.cmp(&right.worktree_status))
    });

    Ok(entries)
}

/// Legal porcelain v1 status codes for the index (X) and worktree (Y) columns.
const PORCELAIN_V1_STATUS_CODES: &[u8] = b" MADRC?U";

/// Returns true if `(x, y)` is a legal porcelain v1 status-code pair.
///
/// `?` is only valid when both columns are `?` (an untracked path); any other
/// mix of `?` is malformed. `!` (ignored) is intentionally rejected because
/// this command never passes `--ignored`, so an `!` would indicate a corrupted
/// stream rather than a real record.
fn is_valid_status_pair(x: u8, y: u8) -> bool {
    if x == b'?' && y == b'?' {
        return true;
    }
    if x == b'?' || y == b'?' {
        return false;
    }
    PORCELAIN_V1_STATUS_CODES.contains(&x) && PORCELAIN_V1_STATUS_CODES.contains(&y)
}


pub fn git_status_parse_error(reason: &str) -> NativeError {
    NativeError::with_details(
        "git.command_failed",
        "Git returned an unexpected failure.",
        format!("read the workspace Git status; invalid porcelain v1 output: {reason}"),
    )
}


pub fn git_run_error(action: &str, error: GitRunError) -> NativeError {
    match error {
        GitRunError::NotFound(error) => NativeError::with_details(
            "git.not_installed",
            "Git is not installed or is unavailable on PATH.",
            error.to_string(),
        ),
        GitRunError::TimedOut => NativeError::with_details(
            "git.command_timeout",
            "Git did not finish before the command timeout.",
            action,
        ),
        GitRunError::Io(error) => NativeError::with_details(
            "git.command_failed",
            "Failed to run a Git command.",
            format!("{action}: {error}"),
        ),
    }
}


pub fn git_command_failed(action: &str, output: &GitCommandOutput) -> NativeError {
    let stdout = bounded_git_text(&output.stdout);
    let stderr = bounded_git_text(&output.stderr);
    let details = match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => format!("{action}; exit status {:?}", output.exit_code),
        (false, true) => format!("{action}; stdout: {stdout}"),
        (true, false) => format!("{action}; stderr: {stderr}"),
        (false, false) => format!("{action}; stdout: {stdout}; stderr: {stderr}"),
    };

    NativeError::with_details(
        "git.command_failed",
        "Git returned an unexpected failure.",
        bounded_git_text(&details),
    )
}


pub fn non_empty_git_text(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| bounded_git_text(value))
}


pub fn bounded_git_text(value: &str) -> String {
    let mut characters = value.chars();
    let truncated: String = characters.by_ref().take(MAX_GIT_DETAILS_LENGTH).collect();

    if characters.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

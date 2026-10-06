use crate::commands::watcher::record_self_write;
use crate::error::{NativeError, failed};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;

use std::fs;

const MAX_MARKDOWN_DEPTH: usize = 20;

use crate::commands::workspace::{
    MAX_WORKSPACE_ENTRIES, acquire_workspace_mutation_lock, ensure_parent_dir, entry_metadata,
    is_ignored_entry_name, normalize_relative_path, resolve_workspace_entry_path,
    resolve_workspace_root, write_file_atomically,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MarkdownFileEntry {
    pub relative_path: String,
    pub file_name: String,
    pub parent_path: String,
    pub byte_size: u64,
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MarkdownFileContents {
    pub relative_path: String,
    pub contents: String,
}

#[tauri::command]
pub fn read_markdown_file(
    root_path: String,
    relative_path: String,
) -> Result<MarkdownFileContents, NativeError> {
    read_note(&root_path, &relative_path)
}

/// Which kind of UTF-8 document the shared read/write core is serving.
///
/// Notes and generic text files share every mechanic — path containment, the
/// write precondition, the best-effort backup, the atomic write — and differ
/// only in whether the path must be Markdown and in the words of the errors.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocumentKind {
    Note,
    Text,
}

impl DocumentKind {
    /// Resolves the workspace-relative path with this kind's own rule:
    /// a note must carry a Markdown extension; a text file accepts any.
    fn resolve_file_path(&self, root: &Path, relative_path: &str) -> Result<PathBuf, NativeError> {
        match self {
            Self::Note => resolve_markdown_file_path(root, relative_path),
            Self::Text => resolve_workspace_entry_path(root, relative_path),
        }
    }

    fn missing_file_message(&self) -> &'static str {
        match self {
            Self::Note => "Cannot write a Markdown file that does not exist.",
            Self::Text => "Cannot write a file that does not exist.",
        }
    }

    fn read_message(&self) -> &'static str {
        match self {
            Self::Note => "Failed to read the Markdown file.",
            Self::Text => "Failed to read the file.",
        }
    }

    fn write_message(&self) -> &'static str {
        match self {
            Self::Note => "Failed to write the Markdown file.",
            Self::Text => "Failed to write the file.",
        }
    }

    /// An undecodable note reads as damage; a text file may just be binary.
    fn not_utf8_error(&self, error: std::string::FromUtf8Error) -> NativeError {
        match self {
            Self::Note => NativeError::with_details(
                "workspace.note_unreadable",
                "This note is not readable as text. It may have been damaged.",
                error,
            ),
            Self::Text => NativeError::with_details(
                "workspace.file_not_text",
                "This file is not readable as text. It may be a binary file.",
                error,
            ),
        }
    }

    fn conflict_error(&self) -> NativeError {
        match self {
            Self::Note => NativeError::new(
                "workspace.note_conflict",
                "The note changed on disk while it was being edited.",
            ),
            Self::Text => NativeError::new(
                "workspace.file_conflict",
                "The file changed on disk while it was being edited.",
            ),
        }
    }
}

/// The read/write core shared by `markdown.rs` and `text_files.rs` commands.
///
/// `backups_to` is the app-data directory to keep the replaced version under,
/// or `None` to keep none — which is what callers with nothing to protect
/// (tests, and any path where app-data cannot be resolved) pass.
pub fn read_document(
    root_path: &str,
    relative_path: &str,
    kind: DocumentKind,
) -> Result<MarkdownFileContents, NativeError> {
    let root = resolve_workspace_root(root_path)?;
    let file_path = kind.resolve_file_path(&root, relative_path)?;
    let bytes = fs::read(&file_path)
        .map_err(|error| failed("workspace.read_failed", kind.read_message(), error))?;

    let contents = String::from_utf8(bytes).map_err(|error| kind.not_utf8_error(error))?;

    Ok(MarkdownFileContents {
        relative_path: normalize_relative_path(relative_path)?,
        contents,
    })
}

pub fn write_document(
    root_path: &str,
    relative_path: &str,
    contents: String,
    expected: Option<&str>,
    backups_to: Option<&Path>,
    kind: DocumentKind,
) -> Result<MarkdownFileEntry, NativeError> {
    let root = resolve_workspace_root(root_path)?;
    let file_path = kind.resolve_file_path(&root, relative_path)?;

    // Held across the read, the check and the write. A check that another
    // in-process writer could land inside would only narrow the window it was
    // added to close; this is the lock the entry mutations already take, so a
    // rename or delete cannot slip in either.
    let _mutation_lock = acquire_workspace_mutation_lock();

    if !file_path.is_file() {
        return Err(NativeError::new(
            "workspace.file_missing",
            kind.missing_file_message(),
        ));
    }

    if let Some(expected) = expected {
        check_document_write_precondition(&file_path, expected, kind)?;
    }

    // Keep what is about to be replaced. Best-effort on purpose: the user
    // pressed save, and failing the write because a *copy* of the old version
    // could not be made would turn the safety net into a way to lose work.
    if let Some(app_data) = backups_to {
        super::backup::keep_previous_version_best_effort(
            app_data,
            &root,
            relative_path,
            &file_path,
        );
    }

    record_self_write(&file_path);
    // Temp-then-rename rather than `fs::write`, which truncates first: a crash
    // between emptying the note and refilling it would leave nothing at all.
    write_file_atomically(&file_path, &contents)
        .map_err(|error| failed("workspace.write_failed", kind.write_message(), error))?;

    markdown_file_entry(&root, &file_path)
}

/// Refuses a write computed from text the file no longer holds.
///
/// An unreadable file counts as a mismatch rather than an error of its own: the
/// caller's answer is the same either way — do not overwrite — and reporting it
/// as a read failure would send them down a path that cannot help.
fn check_document_write_precondition(
    file_path: &Path,
    expected: &str,
    kind: DocumentKind,
) -> Result<(), NativeError> {
    if fs::read_to_string(file_path).ok().as_deref() == Some(expected) {
        return Ok(());
    }

    Err(kind.conflict_error())
}

/// Reads a note, telling damage apart from absence.
///
/// `fs::read_to_string` folds an encoding failure into the same error an
/// unreadable file gets, so the shell could not tell "this note is not there"
/// from "this note is there and wrong" — and had no reason to offer a recovery
/// path for the second. Both checks below cost nothing extra: the bytes are
/// being read either way.
///
/// Deliberately absent is any check on emptiness or length. A short note is not
/// a damaged one, and an empty note is usually a note somebody emptied — the
/// obvious test, "empty but we kept something non-empty", fires on exactly that
/// ordinary action, since the thing it kept is the text they just deleted.
/// Telling people their own edit was corruption is worse than saying nothing.
///
/// What actually distinguishes damage is that the note became empty *without
/// the app writing it*, which is the watcher's knowledge and not this function's.
/// That check belongs on the outside-change path and is not built yet.
///
/// Split from the command so it can be tested: the `AppHandle` a
/// `#[tauri::command]` takes is unavailable to a unit test.
pub fn read_note(
    root_path: &str,
    relative_path: &str,
) -> Result<MarkdownFileContents, NativeError> {
    read_document(root_path, relative_path, DocumentKind::Note)
}

#[tauri::command]
pub fn write_markdown_file(
    app: tauri::AppHandle,
    root_path: String,
    relative_path: String,
    contents: String,
    expected: Option<String>,
) -> Result<MarkdownFileEntry, NativeError> {
    // A vault whose app-data cannot be resolved still saves; it just keeps no
    // backup. Refusing the write would be the safety net causing the loss.
    let app_data = app.path().app_data_dir().ok();
    write_markdown_document(
        &root_path,
        &relative_path,
        contents,
        expected.as_deref(),
        app_data.as_deref(),
    )
}

/// Writes a note, optionally refusing if it is not what the caller last read.
///
/// A note has writers the app cannot see — a sync client, an editor in another
/// window, the user's own shell — and until this precondition existed a save
/// put the tab's text over whatever they had written, without anyone being
/// told. `expected` carries the text the caller computed its version from, so
/// that loss becomes a refusal the caller can put to the user.
///
/// `expected: None` means *unchecked*, which is the opposite of what `None`
/// means for the settings documents (there, an absent file is itself something
/// to expect). The difference is deliberate: a note always exists by the time
/// this runs, and callers with no read behind them — extension writes, scripted
/// edits — have nothing to expect. Leaving the check opt-in is what lets the
/// shell send one on every save without paying for an extra read.
///
/// Split from the command so it can be tested: the `AppHandle` a `#[tauri::command]`
/// takes is unavailable to a unit test, and a comparison tested on its own would
/// not show that a refused write leaves the file alone.
/// `backups_to` is the app-data directory to keep the replaced version under,
/// or `None` to keep none — which is what callers with nothing to protect
/// (tests, and any path where app-data cannot be resolved) pass.
pub fn write_markdown_document(
    root_path: &str,
    relative_path: &str,
    contents: String,
    expected: Option<&str>,
    backups_to: Option<&Path>,
) -> Result<MarkdownFileEntry, NativeError> {
    write_document(
        root_path,
        relative_path,
        contents,
        expected,
        backups_to,
        DocumentKind::Note,
    )
}

#[tauri::command]
pub fn create_markdown_file(
    _app: tauri::AppHandle,
    root_path: String,
    relative_path: String,
    contents: Option<String>,
) -> Result<MarkdownFileEntry, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let file_path = resolve_markdown_file_path(&root, &relative_path)?;

    if file_path.exists() {
        return Err(NativeError::new(
            "workspace.file_exists",
            "A Markdown file already exists at that path.",
        ));
    }

    ensure_parent_dir(&file_path, "Failed to create the note folder.")?;

    record_self_write(&file_path);
    // Nothing exists to lose here, but a note is written one way in this file.
    write_file_atomically(&file_path, contents.unwrap_or_default()).map_err(|error| {
        failed(
            "workspace.create_failed",
            "Failed to create the Markdown file.",
            error,
        )
    })?;

    markdown_file_entry(&root, &file_path)
}

pub fn resolve_markdown_file_path(
    root: &Path,
    relative_path: &str,
) -> Result<PathBuf, NativeError> {
    // The extension check runs on the input: the entry resolver normalizes
    // separators itself, so checking again here would only repeat its work.
    if !is_markdown_path(Path::new(relative_path)) {
        return Err(NativeError::new(
            "workspace.not_markdown",
            "Only Markdown files can be managed by this command.",
        ));
    }

    // `resolve_workspace_entry_path` rejects `..`, and it cannot see symlinks
    // from the string alone, so it canonicalizes and verifies containment for
    // both existing targets and not-yet-created ones.
    resolve_workspace_entry_path(root, relative_path)
}

pub fn list_markdown_file_entries(root: &Path) -> Result<Vec<MarkdownFileEntry>, NativeError> {
    let mut files = Vec::new();
    collect_markdown_file_entries(root, root, &mut files, 0)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(files)
}

pub fn collect_markdown_file_entries(
    root: &Path,
    current: &Path,
    files: &mut Vec<MarkdownFileEntry>,
    depth: usize,
) -> Result<(), NativeError> {
    if depth > MAX_MARKDOWN_DEPTH || files.len() > MAX_WORKSPACE_ENTRIES {
        return Ok(());
    }

    let entries = fs::read_dir(current).map_err(|error| {
        failed(
            "workspace.list_failed",
            "Failed to list Markdown files in the workspace.",
            error,
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            failed(
                "workspace.list_failed",
                "Failed to inspect a workspace file.",
                error,
            )
        })?;
        let path = entry.path();

        let name = entry.file_name().to_string_lossy().to_string();
        if is_ignored_entry_name(&name) {
            continue;
        }

        let file_type = entry.file_type().map_err(|error| {
            failed(
                "workspace.list_failed",
                "Failed to inspect a workspace file type.",
                error,
            )
        })?;

        if file_type.is_dir() {
            collect_markdown_file_entries(root, &path, files, depth + 1)?;
        } else if file_type.is_file() && is_markdown_path(&path) {
            files.push(markdown_file_entry(root, &path)?);
        }
    }

    Ok(())
}

pub fn markdown_file_entry(
    root: &Path,
    file_path: &Path,
) -> Result<MarkdownFileEntry, NativeError> {
    let metadata = entry_metadata(root, file_path)?;

    Ok(MarkdownFileEntry {
        file_name: metadata.file_name,
        parent_path: metadata.parent_path,
        relative_path: metadata.relative_path,
        byte_size: metadata.byte_size,
        updated_at: metadata.updated_at,
    })
}

pub fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
        .unwrap_or(false)
}

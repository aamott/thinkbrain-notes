//! Generic text file read/write commands for non-Markdown files (code, config, etc.).
//!
//! Unlike `markdown.rs`, these commands accept any file extension — the only
//! constraint is that the file must be valid UTF-8 text. The mechanics are the
//! shared document core in `markdown.rs`; `DocumentKind::Text` supplies the
//! path rule and the wording of the errors.

use crate::commands::markdown::{
    DocumentKind, MarkdownFileContents, MarkdownFileEntry, read_document, write_document,
};
use crate::error::NativeError;
use tauri::Manager;

#[tauri::command]
pub fn read_text_file(
    root_path: String,
    relative_path: String,
) -> Result<MarkdownFileContents, NativeError> {
    read_document(&root_path, &relative_path, DocumentKind::Text)
}

#[tauri::command]
pub fn write_text_file(
    app: tauri::AppHandle,
    root_path: String,
    relative_path: String,
    contents: String,
    expected: Option<String>,
) -> Result<MarkdownFileEntry, NativeError> {
    // A vault whose app-data cannot be resolved still saves; it just keeps no
    // backup.
    let app_data = app.path().app_data_dir().ok();
    write_document(
        &root_path,
        &relative_path,
        contents,
        expected.as_deref(),
        app_data.as_deref(),
        DocumentKind::Text,
    )
}

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::Manager;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NativeError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl NativeError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(
        code: impl Into<String>,
        message: impl Into<String>,
        details: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: Some(details.into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ShellStatus {
    pub app_name: String,
    pub shell_version: String,
    pub ready: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceDescriptor {
    pub root_path: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MarkdownFileEntry {
    pub relative_path: String,
    pub file_name: String,
    pub parent_path: String,
    pub byte_size: u64,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MarkdownFileContents {
    pub relative_path: String,
    pub contents: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceSnapshot {
    pub workspace: WorkspaceDescriptor,
    pub files: Vec<MarkdownFileEntry>,
}

/// A single note record sent from the frontend to (re)index.
///
/// The frontend extracts these fields with the shared core parser, so the
/// native layer never reimplements frontmatter/tag parsing. Field names arrive
/// from JS as camelCase and are mapped to these snake_case fields by serde.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRecord {
    pub path: String,
    pub file_name: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub body: String,
}

/// A ranked search match returned to the frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SearchHit {
    pub path: String,
    pub file_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub snippet: String,
    pub score: f64,
}

#[tauri::command]
fn desktop_shell_status() -> Result<ShellStatus, NativeError> {
    Ok(ShellStatus {
        app_name: "Thinkbrain Notes".to_string(),
        shell_version: env!("CARGO_PKG_VERSION").to_string(),
        ready: true,
    })
}

#[tauri::command]
fn open_workspace(root_path: String) -> Result<WorkspaceSnapshot, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    Ok(WorkspaceSnapshot {
        workspace: describe_workspace(&root),
        files: list_markdown_file_entries(&root)?,
    })
}

#[tauri::command]
fn list_markdown_files(root_path: String) -> Result<Vec<MarkdownFileEntry>, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    list_markdown_file_entries(&root)
}

#[tauri::command]
fn read_markdown_file(
    root_path: String,
    relative_path: String,
) -> Result<MarkdownFileContents, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let file_path = resolve_markdown_file_path(&root, &relative_path)?;
    let contents = fs::read_to_string(&file_path).map_err(|error| {
        NativeError::with_details(
            "workspace.read_failed",
            "Failed to read the Markdown file.",
            error.to_string(),
        )
    })?;

    Ok(MarkdownFileContents {
        relative_path: normalize_relative_path(&relative_path)?,
        contents,
    })
}

#[tauri::command]
fn write_markdown_file(
    root_path: String,
    relative_path: String,
    contents: String,
) -> Result<MarkdownFileEntry, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let file_path = resolve_markdown_file_path(&root, &relative_path)?;

    if !file_path.is_file() {
        return Err(NativeError::new(
            "workspace.file_missing",
            "Cannot write a Markdown file that does not exist.",
        ));
    }

    fs::write(&file_path, contents).map_err(|error| {
        NativeError::with_details(
            "workspace.write_failed",
            "Failed to write the Markdown file.",
            error.to_string(),
        )
    })?;

    markdown_file_entry(&root, &file_path)
}

#[tauri::command]
fn create_markdown_file(
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

    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            NativeError::with_details(
                "workspace.create_parent_failed",
                "Failed to create the note folder.",
                error.to_string(),
            )
        })?;
    }

    fs::write(&file_path, contents.unwrap_or_default()).map_err(|error| {
        NativeError::with_details(
            "workspace.create_failed",
            "Failed to create the Markdown file.",
            error.to_string(),
        )
    })?;

    markdown_file_entry(&root, &file_path)
}

#[tauri::command]
fn rename_markdown_file(
    root_path: String,
    relative_path: String,
    new_relative_path: String,
) -> Result<MarkdownFileEntry, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let file_path = resolve_markdown_file_path(&root, &relative_path)?;
    let new_file_path = resolve_markdown_file_path(&root, &new_relative_path)?;

    if !file_path.is_file() {
        return Err(NativeError::new(
            "workspace.file_missing",
            "Cannot rename a Markdown file that does not exist.",
        ));
    }

    if new_file_path.exists() {
        return Err(NativeError::new(
            "workspace.file_exists",
            "A Markdown file already exists at the new path.",
        ));
    }

    if let Some(parent) = new_file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            NativeError::with_details(
                "workspace.create_parent_failed",
                "Failed to create the destination folder.",
                error.to_string(),
            )
        })?;
    }

    fs::rename(&file_path, &new_file_path).map_err(|error| {
        NativeError::with_details(
            "workspace.rename_failed",
            "Failed to rename the Markdown file.",
            error.to_string(),
        )
    })?;

    markdown_file_entry(&root, &new_file_path)
}

#[tauri::command]
fn delete_markdown_file(root_path: String, relative_path: String) -> Result<(), NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let file_path = resolve_markdown_file_path(&root, &relative_path)?;

    if !file_path.is_file() {
        return Err(NativeError::new(
            "workspace.file_missing",
            "Cannot delete a Markdown file that does not exist.",
        ));
    }

    fs::remove_file(&file_path).map_err(|error| {
        NativeError::with_details(
            "workspace.delete_failed",
            "Failed to delete the Markdown file.",
            error.to_string(),
        )
    })
}

#[tauri::command]
fn index_documents(
    app: tauri::AppHandle,
    root_path: String,
    documents: Vec<DocumentRecord>,
) -> Result<usize, NativeError> {
    let mut connection = open_index_connection(&app, &root_path)?;

    index_document_records(&mut connection, &documents).map_err(|error| {
        NativeError::with_details(
            "index.write_failed",
            "Failed to update the search index.",
            error.to_string(),
        )
    })
}

#[tauri::command]
fn search_index(
    app: tauri::AppHandle,
    root_path: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SearchHit>, NativeError> {
    let connection = open_index_connection(&app, &root_path)?;
    let resolved_limit = limit.unwrap_or(50).clamp(1, 200) as usize;

    search_documents(&connection, &query, resolved_limit).map_err(|error| {
        NativeError::with_details(
            "index.search_failed",
            "Failed to search the workspace index.",
            error.to_string(),
        )
    })
}

#[tauri::command]
fn clear_index(app: tauri::AppHandle, root_path: String) -> Result<(), NativeError> {
    let connection = open_index_connection(&app, &root_path)?;

    clear_documents(&connection).map_err(|error| {
        NativeError::with_details(
            "index.clear_failed",
            "Failed to clear the workspace index.",
            error.to_string(),
        )
    })
}

#[tauri::command]
fn remove_index_document(
    app: tauri::AppHandle,
    root_path: String,
    path: String,
) -> Result<(), NativeError> {
    let connection = open_index_connection(&app, &root_path)?;

    delete_document(&connection, &path).map_err(|error| {
        NativeError::with_details(
            "index.remove_failed",
            "Failed to remove a document from the workspace index.",
            error.to_string(),
        )
    })
}

#[tauri::command]
fn read_app_settings(app: tauri::AppHandle) -> Result<Option<String>, NativeError> {
    read_settings_file(&resolve_app_settings_path(&app)?)
}

#[tauri::command]
fn write_app_settings(app: tauri::AppHandle, contents: String) -> Result<(), NativeError> {
    write_settings_file(&resolve_app_settings_path(&app)?, &contents)
}

#[tauri::command]
fn read_workspace_settings(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<Option<String>, NativeError> {
    read_settings_file(&resolve_workspace_settings_path(&app, &root_path)?)
}

#[tauri::command]
fn write_workspace_settings(
    app: tauri::AppHandle,
    root_path: String,
    contents: String,
) -> Result<(), NativeError> {
    write_settings_file(
        &resolve_workspace_settings_path(&app, &root_path)?,
        &contents,
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            desktop_shell_status,
            open_workspace,
            list_markdown_files,
            read_markdown_file,
            write_markdown_file,
            create_markdown_file,
            rename_markdown_file,
            delete_markdown_file,
            index_documents,
            search_index,
            clear_index,
            remove_index_document,
            read_app_settings,
            write_app_settings,
            read_workspace_settings,
            write_workspace_settings
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Thinkbrain Notes desktop shell");
}

fn resolve_workspace_root(root_path: &str) -> Result<PathBuf, NativeError> {
    let root = PathBuf::from(root_path);

    if !root.is_absolute() {
        return Err(NativeError::new(
            "workspace.invalid_root",
            "Workspace root must be an absolute path.",
        ));
    }

    let canonical_root = root.canonicalize().map_err(|error| {
        NativeError::with_details(
            "workspace.open_failed",
            "Failed to open the workspace folder.",
            error.to_string(),
        )
    })?;

    if !canonical_root.is_dir() {
        return Err(NativeError::new(
            "workspace.not_directory",
            "Workspace root must be a folder.",
        ));
    }

    Ok(canonical_root)
}

fn resolve_markdown_file_path(root: &Path, relative_path: &str) -> Result<PathBuf, NativeError> {
    let normalized = normalize_relative_path(relative_path)?;
    let path = root.join(normalized);

    if !is_markdown_path(&path) {
        return Err(NativeError::new(
            "workspace.not_markdown",
            "Only Markdown files can be managed by this command.",
        ));
    }

    Ok(path)
}

fn normalize_relative_path(relative_path: &str) -> Result<String, NativeError> {
    let path = Path::new(relative_path);

    if path.is_absolute() {
        return Err(NativeError::new(
            "workspace.invalid_path",
            "File path must be relative to the workspace.",
        ));
    }

    let mut parts = Vec::new();

    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let part = part.to_string_lossy();
                if part.trim().is_empty() {
                    return Err(NativeError::new(
                        "workspace.invalid_path",
                        "File path contains an empty segment.",
                    ));
                }
                parts.push(part.to_string());
            }
            Component::CurDir => {}
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err(NativeError::new(
                    "workspace.invalid_path",
                    "File path must stay inside the workspace.",
                ));
            }
        }
    }

    if parts.is_empty() {
        return Err(NativeError::new(
            "workspace.invalid_path",
            "File path cannot be empty.",
        ));
    }

    Ok(parts.join("/"))
}

fn describe_workspace(root: &Path) -> WorkspaceDescriptor {
    WorkspaceDescriptor {
        root_path: root.to_string_lossy().to_string(),
        name: root
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| root.to_string_lossy().to_string()),
    }
}

fn list_markdown_file_entries(root: &Path) -> Result<Vec<MarkdownFileEntry>, NativeError> {
    let mut files = Vec::new();
    collect_markdown_file_entries(root, root, &mut files)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(files)
}

fn collect_markdown_file_entries(
    root: &Path,
    current: &Path,
    files: &mut Vec<MarkdownFileEntry>,
) -> Result<(), NativeError> {
    let entries = fs::read_dir(current).map_err(|error| {
        NativeError::with_details(
            "workspace.list_failed",
            "Failed to list Markdown files in the workspace.",
            error.to_string(),
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            NativeError::with_details(
                "workspace.list_failed",
                "Failed to inspect a workspace file.",
                error.to_string(),
            )
        })?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| {
            NativeError::with_details(
                "workspace.list_failed",
                "Failed to inspect a workspace file type.",
                error.to_string(),
            )
        })?;

        if file_type.is_dir() {
            collect_markdown_file_entries(root, &path, files)?;
        } else if file_type.is_file() && is_markdown_path(&path) {
            files.push(markdown_file_entry(root, &path)?);
        }
    }

    Ok(())
}

fn markdown_file_entry(root: &Path, file_path: &Path) -> Result<MarkdownFileEntry, NativeError> {
    let relative_path = file_path
        .strip_prefix(root)
        .map_err(|error| {
            NativeError::with_details(
                "workspace.invalid_path",
                "File path is outside the workspace.",
                error.to_string(),
            )
        })?
        .to_string_lossy()
        .replace('\\', "/");
    let metadata = fs::metadata(file_path).map_err(|error| {
        NativeError::with_details(
            "workspace.metadata_failed",
            "Failed to read Markdown file metadata.",
            error.to_string(),
        )
    })?;
    let updated_at = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().to_string());

    Ok(MarkdownFileEntry {
        file_name: file_path
            .file_name()
            .map(|file_name| file_name.to_string_lossy().to_string())
            .unwrap_or_else(|| relative_path.clone()),
        parent_path: Path::new(&relative_path)
            .parent()
            .map(|parent| parent.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default(),
        relative_path,
        byte_size: metadata.len(),
        updated_at,
    })
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
        .unwrap_or(false)
}

/// Opens (creating if needed) the SQLite FTS5 cache for a workspace.
///
/// The database always lives in the OS application-data directory, never inside
/// the workspace, satisfying the project's user-data separation rule.
fn open_index_connection(
    app: &tauri::AppHandle,
    root_path: &str,
) -> Result<Connection, NativeError> {
    let db_path = resolve_index_db_path(app, root_path)?;
    let connection = Connection::open(&db_path).map_err(|error| {
        NativeError::with_details(
            "index.open_failed",
            "Failed to open the search index database.",
            error.to_string(),
        )
    })?;

    init_index_schema(&connection).map_err(|error| {
        NativeError::with_details(
            "index.schema_failed",
            "Failed to initialize the search index schema.",
            error.to_string(),
        )
    })?;

    Ok(connection)
}

/// Resolves the per-workspace index database path inside the app-data dir.
///
/// Each workspace gets its own cache file named from a stable hash of the
/// canonicalized workspace root, so distinct vaults never collide.
fn resolve_index_db_path(app: &tauri::AppHandle, root_path: &str) -> Result<PathBuf, NativeError> {
    let canonical_root = resolve_workspace_root(root_path)?;
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        NativeError::with_details(
            "index.app_data_unavailable",
            "Failed to resolve the application data directory.",
            error.to_string(),
        )
    })?;
    let index_dir = app_data_dir.join("index");

    fs::create_dir_all(&index_dir).map_err(|error| {
        NativeError::with_details(
            "index.create_dir_failed",
            "Failed to create the search index directory.",
            error.to_string(),
        )
    })?;

    let workspace_key = stable_workspace_hash(&canonical_root.to_string_lossy());

    Ok(index_dir.join(format!("workspace-{workspace_key:016x}.sqlite3")))
}

/// Computes a deterministic 64-bit FNV-1a hash for workspace cache filenames.
///
/// A stable, dependency-free hash keeps the same workspace mapped to the same
/// cache file across runs (unlike `DefaultHasher`, which is not guaranteed
/// stable between Rust versions).
fn stable_workspace_hash(input: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;

    for byte in input.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }

    hash
}

fn resolve_app_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, NativeError> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        NativeError::with_details(
            "settings.app_data_unavailable",
            "Failed to resolve the application data directory.",
            error.to_string(),
        )
    })?;

    Ok(app_settings_path(&app_data_dir))
}

fn resolve_workspace_settings_path(
    app: &tauri::AppHandle,
    root_path: &str,
) -> Result<PathBuf, NativeError> {
    let canonical_root = resolve_workspace_root(root_path)?;
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        NativeError::with_details(
            "settings.app_data_unavailable",
            "Failed to resolve the application data directory.",
            error.to_string(),
        )
    })?;

    Ok(workspace_settings_path(&app_data_dir, &canonical_root))
}

fn app_settings_path(app_data_dir: &Path) -> PathBuf {
    settings_dir(app_data_dir).join("app.json")
}

fn workspace_settings_path(app_data_dir: &Path, canonical_root: &Path) -> PathBuf {
    let workspace_key = stable_workspace_hash(&canonical_root.to_string_lossy());

    settings_dir(app_data_dir).join(format!("workspace-{workspace_key:016x}.json"))
}

fn settings_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("settings")
}

fn read_settings_file(path: &Path) -> Result<Option<String>, NativeError> {
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(NativeError::with_details(
            "settings.read_failed",
            "Failed to read the settings file.",
            error.to_string(),
        )),
    }
}

fn write_settings_file(path: &Path, contents: &str) -> Result<(), NativeError> {
    let parent = path.parent().ok_or_else(|| {
        NativeError::new(
            "settings.invalid_path",
            "Settings file path must include a parent directory.",
        )
    })?;

    fs::create_dir_all(parent).map_err(|error| {
        NativeError::with_details(
            "settings.create_dir_failed",
            "Failed to create the settings directory.",
            error.to_string(),
        )
    })?;

    fs::write(path, contents).map_err(|error| {
        NativeError::with_details(
            "settings.write_failed",
            "Failed to write the settings file.",
            error.to_string(),
        )
    })
}

/// Creates the FTS5 virtual table backing search. Idempotent.
///
/// Every searchable field (filename, title, tags, aliases, body) is a column so
/// a single `MATCH` query ranks across all of them. `path` is stored but not
/// tokenized so results can resolve back to a workspace-relative file.
fn init_index_schema(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
            path UNINDEXED,
            file_name,
            title,
            tags,
            aliases,
            body,
            tokenize = 'unicode61 remove_diacritics 1'
        );",
    )
}

/// Inserts or replaces a single document keyed by its workspace-relative path.
fn upsert_document(connection: &Connection, record: &DocumentRecord) -> rusqlite::Result<()> {
    connection.execute(
        "DELETE FROM documents_fts WHERE path = ?1",
        params![record.path],
    )?;
    connection.execute(
        "INSERT INTO documents_fts (path, file_name, title, tags, aliases, body)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            record.path,
            record.file_name,
            record.title.clone().unwrap_or_default(),
            record.tags.join(" "),
            record.aliases.join(" "),
            record.body,
        ],
    )?;

    Ok(())
}

/// Removes a single document from the index by path. No-op if absent.
fn delete_document(connection: &Connection, path: &str) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM documents_fts WHERE path = ?1", params![path])?;

    Ok(())
}

/// Clears every indexed document, used to rebuild the cache from scratch.
fn clear_documents(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM documents_fts", [])?;

    Ok(())
}

/// Upserts many records inside a single transaction for fast (re)indexing.
fn index_document_records(
    connection: &mut Connection,
    records: &[DocumentRecord],
) -> rusqlite::Result<usize> {
    let transaction = connection.transaction()?;

    for record in records {
        upsert_document(&transaction, record)?;
    }

    transaction.commit()?;

    Ok(records.len())
}

/// Runs a ranked full-text search across all indexed columns.
///
/// User input is sanitized into a safe FTS5 MATCH expression so special syntax
/// can never raise an error. Returns `bm25`-ordered matches (best first).
fn search_documents(
    connection: &Connection,
    query: &str,
    limit: usize,
) -> rusqlite::Result<Vec<SearchHit>> {
    let match_query = match build_fts_match_query(query) {
        Some(value) => value,
        None => return Ok(Vec::new()),
    };

    let mut statement = connection.prepare(
        "SELECT path,
                file_name,
                title,
                snippet(documents_fts, 5, '', '', '…', 12) AS snippet,
                bm25(documents_fts) AS score
         FROM documents_fts
         WHERE documents_fts MATCH ?1
         ORDER BY score
         LIMIT ?2",
    )?;

    let rows = statement.query_map(params![match_query, limit as i64], |row| {
        let title: String = row.get(2)?;

        Ok(SearchHit {
            path: row.get(0)?,
            file_name: row.get(1)?,
            title: if title.is_empty() { None } else { Some(title) },
            snippet: row.get(3)?,
            score: row.get(4)?,
        })
    })?;

    let mut hits = Vec::new();

    for row in rows {
        hits.push(row?);
    }

    Ok(hits)
}

/// Builds a safe FTS5 MATCH expression from arbitrary user input.
///
/// Each whitespace-separated token is quoted (neutralizing FTS5 operators like
/// `*`, `:`, `-`, parentheses) and given a trailing `*` for prefix matching so
/// search-as-you-type works. Returns `None` when there is no usable token.
fn build_fts_match_query(raw: &str) -> Option<String> {
    let clauses: Vec<String> = raw
        .split_whitespace()
        // A double quote is the only character meaningful inside a quoted FTS5
        // string; drop it so we can safely wrap each token in quotes.
        .map(|token| token.replace('"', ""))
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{token}\"*"))
        .collect();

    if clauses.is_empty() {
        return None;
    }

    Some(clauses.join(" "))
}

#[cfg(test)]
mod tests {
    use super::{
        app_settings_path, build_fts_match_query, clear_documents, delete_document,
        desktop_shell_status, index_document_records, init_index_schema, is_markdown_path,
        normalize_relative_path, read_settings_file, search_documents, stable_workspace_hash,
        workspace_settings_path, write_settings_file, DocumentRecord, NativeError,
    };
    use rusqlite::Connection;
    use std::{
        fs,
        path::{Path, PathBuf},
        time::SystemTime,
    };

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
}

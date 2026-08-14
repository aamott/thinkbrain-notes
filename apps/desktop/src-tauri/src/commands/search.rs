use crate::commands::workspace::{resolve_workspace_root, stable_workspace_hash};
use crate::error::NativeError;
use rusqlite::{params, Connection, Transaction};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::Manager;

mod metadata;
#[cfg(test)]
mod metadata_tests;

pub use metadata::{MetadataField, MetadataPredicate, MetadataQueryResult};
use metadata::{
    clear_document_metadata, delete_document_metadata, init_metadata_schema, normalize_path_prefix,
    path_prefix_sql, replace_document_metadata,
};

static SEARCH_CONNECTIONS: Mutex<Option<HashMap<String, Arc<Mutex<Connection>>>>> = Mutex::new(None);

pub fn get_search_connection(
    app: &tauri::AppHandle,
    root_path: &str,
) -> Result<Arc<Mutex<Connection>>, NativeError> {
    let mut lock = SEARCH_CONNECTIONS.lock().unwrap_or_else(|error| error.into_inner());
    let pool = lock.get_or_insert_with(HashMap::new);
    if let Some(conn) = pool.get(root_path) {
        return Ok(conn.clone());
    }
    let conn = open_index_connection(app, root_path)?;
    let arc = Arc::new(Mutex::new(conn));
    pool.insert(root_path.to_string(), arc.clone());
    Ok(arc)
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
    #[serde(default)]
    pub metadata: Vec<MetadataField>,
}


/// What one full-text search asks for.
///
/// A struct rather than three positional arguments because two of the three are
/// easy to mix up at a call site and neither is obvious read back: `""` means
/// the whole workspace, and the limit is a count of notes, not of characters.
pub struct SearchQuery<'a> {
    /// Raw user input, sanitized into an FTS5 expression before it reaches SQL.
    pub text: &'a str,
    /// Workspace-relative folder to search inside. `""` searches everywhere.
    pub path_prefix: &'a str,
    pub limit: usize,
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
pub fn index_documents(
    app: tauri::AppHandle,
    root_path: String,
    documents: Vec<DocumentRecord>,
) -> Result<usize, NativeError> {
    let connection_pool = get_search_connection(&app, &root_path)?;
    let mut connection = connection_pool.lock().unwrap_or_else(|error| error.into_inner());

    index_document_records(&mut connection, &documents).map_err(|error| {
        NativeError::with_details(
            "index.write_failed",
            "Failed to update the search index.",
            error,
        )
    })
}


#[tauri::command]
pub fn search_index(
    app: tauri::AppHandle,
    root_path: String,
    query: String,
    path_prefix: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<SearchHit>, NativeError> {
    let connection_pool = get_search_connection(&app, &root_path)?;
    let connection = connection_pool.lock().unwrap_or_else(|error| error.into_inner());

    search_documents(
        &connection,
        &SearchQuery {
            text: &query,
            // Absent means the whole workspace, which is what a search box over
            // a vault wants; only a caller with a folder in mind passes one.
            path_prefix: path_prefix.as_deref().unwrap_or(""),
            limit: limit.unwrap_or(50).clamp(1, 200) as usize,
        },
    )
    .map_err(|error| {
        NativeError::with_details(
            "index.search_failed",
            "Failed to search the workspace index.",
            error,
        )
    })
}

#[tauri::command]
pub fn query_index_metadata(
    app: tauri::AppHandle,
    root_path: String,
    path_prefix: String,
    facet_keys: Vec<String>,
    predicates: Vec<MetadataPredicate>,
) -> Result<MetadataQueryResult, NativeError> {
    let connection_pool = get_search_connection(&app, &root_path)?;
    let connection = connection_pool.lock().unwrap_or_else(|error| error.into_inner());

    metadata::query_metadata(
        &connection,
        &metadata::MetadataQuery {
            path_prefix,
            facet_keys,
            predicates,
        },
    )
    .map_err(|error| {
        NativeError::with_details(
            "index.metadata_query_failed",
            "Failed to query workspace metadata.",
            error,
        )
    })
}


#[tauri::command]
pub fn clear_index(app: tauri::AppHandle, root_path: String) -> Result<(), NativeError> {
    let connection_pool = get_search_connection(&app, &root_path)?;
    let mut connection = connection_pool.lock().unwrap_or_else(|error| error.into_inner());

    clear_documents(&mut connection).map_err(|error| {
        NativeError::with_details(
            "index.clear_failed",
            "Failed to clear the workspace index.",
            error,
        )
    })
}


#[tauri::command]
pub fn remove_index_document(
    app: tauri::AppHandle,
    root_path: String,
    path: String,
) -> Result<(), NativeError> {
    let connection_pool = get_search_connection(&app, &root_path)?;
    let mut connection = connection_pool.lock().unwrap_or_else(|error| error.into_inner());

    delete_document(&mut connection, &path).map_err(|error| {
        NativeError::with_details(
            "index.remove_failed",
            "Failed to remove a document from the workspace index.",
            error,
        )
    })
}


/// Opens (creating if needed) the SQLite FTS5 cache for a workspace.
///
/// The database always lives in the OS application-data directory, never inside
/// the workspace, satisfying the project's user-data separation rule.
pub fn open_index_connection(
    app: &tauri::AppHandle,
    root_path: &str,
) -> Result<Connection, NativeError> {
    let db_path = resolve_index_db_path(app, root_path)?;
    let connection = Connection::open(&db_path).map_err(|error| {
        NativeError::with_details(
            "index.open_failed",
            "Failed to open the search index database.",
            error,
        )
    })?;

    init_index_schema(&connection).map_err(|error| {
        NativeError::with_details(
            "index.schema_failed",
            "Failed to initialize the search index schema.",
            error,
        )
    })?;

    Ok(connection)
}


/// Resolves the per-workspace index database path inside the app-data dir.
///
/// Each workspace gets its own cache file named from a stable hash of the
/// canonicalized workspace root, so distinct vaults never collide.
pub fn resolve_index_db_path(app: &tauri::AppHandle, root_path: &str) -> Result<PathBuf, NativeError> {
    let canonical_root = resolve_workspace_root(root_path)?;
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        NativeError::with_details(
            "index.app_data_unavailable",
            "Failed to resolve the application data directory.",
            error,
        )
    })?;
    let index_dir = app_data_dir.join("index");

    fs::create_dir_all(&index_dir).map_err(|error| {
        NativeError::with_details(
            "index.create_dir_failed",
            "Failed to create the search index directory.",
            error,
        )
    })?;

    let workspace_key = stable_workspace_hash(&canonical_root.to_string_lossy());

    Ok(index_dir.join(format!("workspace-{workspace_key:016x}.sqlite3")))
}


/// Creates the FTS5 virtual table backing search. Idempotent.
///
/// Every searchable field (filename, title, tags, aliases, body) is a column so
/// a single `MATCH` query ranks across all of them. `path` is stored but not
/// tokenized so results can resolve back to a workspace-relative file.
pub fn init_index_schema(connection: &Connection) -> rusqlite::Result<()> {
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
    )?;
    init_metadata_schema(connection)
}


fn upsert_document(transaction: &Transaction<'_>, record: &DocumentRecord) -> rusqlite::Result<()> {
    transaction.execute(
        "DELETE FROM documents_fts WHERE path = ?1",
        params![record.path],
    )?;
    transaction.execute(
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
    replace_document_metadata(transaction, &record.path, &record.metadata)?;

    Ok(())
}


/// Removes a single document from the index by path. No-op if absent.
pub fn delete_document(connection: &mut Connection, path: &str) -> rusqlite::Result<()> {
    let transaction = connection.transaction()?;
    delete_document_metadata(&transaction, path)?;
    transaction.execute("DELETE FROM documents_fts WHERE path = ?1", params![path])?;
    transaction.commit()
}


/// Clears every indexed document, used to rebuild the cache from scratch.
pub fn clear_documents(connection: &mut Connection) -> rusqlite::Result<()> {
    let transaction = connection.transaction()?;
    clear_document_metadata(&transaction)?;
    transaction.execute("DELETE FROM documents_fts", [])?;
    transaction.commit()
}


/// Upserts many records inside a single transaction for fast (re)indexing.
pub fn index_document_records(
    connection: &mut Connection,
    records: &[DocumentRecord],
) -> rusqlite::Result<usize> {
    let transaction = connection.transaction()?;

    for record in records {
        upsert_document(&transaction, record)?;
    }

    transaction.execute("INSERT INTO documents_fts(documents_fts) VALUES('optimize');", [])?;

    transaction.commit()?;

    Ok(records.len())
}


/// Runs a ranked full-text search across all indexed columns.
///
/// User input is sanitized into a safe FTS5 MATCH expression so special syntax
/// can never raise an error. Returns `bm25`-ordered matches (best first).
pub fn search_documents(
    connection: &Connection,
    query: &SearchQuery<'_>,
) -> rusqlite::Result<Vec<SearchHit>> {
    let match_query = match build_fts_match_query(query.text) {
        Some(value) => value,
        None => return Ok(Vec::new()),
    };

    // The scope belongs in the query, beside the MATCH, so `LIMIT` counts notes
    // the caller asked for. Filtering the results afterwards would rank the
    // whole workspace first and hand back whatever of the folder survived.
    let mut statement = connection.prepare(&format!(
        "SELECT path,
                file_name,
                title,
                snippet(documents_fts, 5, '', '', '…', 12) AS snippet,
                bm25(documents_fts) AS score
         FROM documents_fts
         WHERE documents_fts MATCH ?1
           AND {}
         ORDER BY score
         LIMIT ?3",
        path_prefix_sql("path", 2)
    ))?;

    let rows = statement.query_map(
        params![
            match_query,
            normalize_path_prefix(query.path_prefix),
            query.limit as i64
        ],
        |row| {
            let title: String = row.get(2)?;

            Ok(SearchHit {
                path: row.get(0)?,
                file_name: row.get(1)?,
                title: if title.is_empty() { None } else { Some(title) },
                snippet: row.get(3)?,
                score: row.get(4)?,
            })
        },
    )?;

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
pub fn build_fts_match_query(raw: &str) -> Option<String> {
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

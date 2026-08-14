use rusqlite::{
    params, params_from_iter,
    types::{Type, Value},
    Connection, Transaction,
};
use serde::{Deserialize, Serialize};
use serde_json::Number;
use std::{
    collections::{BTreeMap, BTreeSet},
    io,
    str::FromStr,
};

pub const INDEX_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(untagged)]
pub enum MetadataValue {
    String(String),
    Number(Number),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataField {
    pub key: String,
    pub values: Vec<MetadataValue>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataPredicate {
    pub key: String,
    pub value: MetadataValue,
}

#[derive(Debug, Clone)]
pub struct MetadataQuery {
    pub path_prefix: String,
    pub facet_keys: Vec<String>,
    pub predicates: Vec<MetadataPredicate>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MetadataFacet {
    pub key: String,
    pub values: Vec<MetadataValue>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MetadataQueryResult {
    pub facets: Vec<MetadataFacet>,
    pub matching_paths: Vec<String>,
}

pub(super) fn init_metadata_schema(connection: &Connection) -> rusqlite::Result<()> {
    let current_version =
        connection.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))?;
    // A normalized companion table keeps arbitrary typed values out of FTS tokenization
    // while sharing the platform index database, transactions, disposal, and rebuild lifecycle.
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS document_metadata (
            path TEXT NOT NULL,
            field_key TEXT NOT NULL,
            value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number')),
            value_text TEXT NOT NULL,
            PRIMARY KEY (path, field_key, value_type, value_text)
        ) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS document_metadata_lookup
            ON document_metadata(field_key, value_type, value_text, path);",
    )?;
    if current_version < INDEX_SCHEMA_VERSION {
        connection.pragma_update(None, "user_version", INDEX_SCHEMA_VERSION)?;
    }
    Ok(())
}

pub(super) fn replace_document_metadata(
    connection: &Transaction<'_>,
    path: &str,
    fields: &[MetadataField],
) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM document_metadata WHERE path = ?1", params![path])?;

    let mut statement = connection.prepare_cached(
        "INSERT OR IGNORE INTO document_metadata(path, field_key, value_type, value_text)
         VALUES (?1, ?2, ?3, ?4)",
    )?;
    for field in fields {
        for value in &field.values {
            let (value_type, value_text) = value.storage_parts();
            statement.execute(params![path, field.key, value_type, value_text])?;
        }
    }

    Ok(())
}

pub(super) fn delete_document_metadata(
    connection: &Connection,
    path: &str,
) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM document_metadata WHERE path = ?1", params![path])?;
    Ok(())
}

pub(super) fn clear_document_metadata(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM document_metadata", [])?;
    Ok(())
}

pub(super) fn query_metadata(
    connection: &Connection,
    query: &MetadataQuery,
) -> rusqlite::Result<MetadataQueryResult> {
    let (matching_sql, matching_params) = build_matching_sql(query);
    let mut statement = connection.prepare(&format!("{matching_sql} ORDER BY d.path"))?;
    let rows = statement.query_map(params_from_iter(matching_params.iter()), |row| row.get(0))?;
    let matching_paths = rows.collect::<rusqlite::Result<Vec<String>>>()?;
    let facet_keys = query
        .facet_keys
        .iter()
        .cloned()
        .collect::<BTreeSet<String>>();
    let mut facet_values = facet_keys
        .iter()
        .cloned()
        .map(|key| (key, Vec::new()))
        .collect::<BTreeMap<String, Vec<MetadataValue>>>();

    if !facet_keys.is_empty() {
        let first_key_parameter = matching_params.len() + 1;
        let key_placeholders = (0..facet_keys.len())
            .map(|offset| format!("?{}", first_key_parameter + offset))
            .collect::<Vec<String>>()
            .join(", ");
        let facet_sql = format!(
            "WITH matching_paths AS ({matching_sql})
             SELECT DISTINCT metadata.field_key, metadata.value_type, metadata.value_text
             FROM document_metadata AS metadata
             JOIN matching_paths AS matches ON matches.path = metadata.path
             WHERE metadata.field_key IN ({key_placeholders})
             ORDER BY metadata.field_key,
                      CASE metadata.value_type WHEN 'number' THEN 0 ELSE 1 END,
                      CASE WHEN metadata.value_type = 'number'
                           THEN CAST(metadata.value_text AS REAL) END,
                      metadata.value_text"
        );
        let mut facet_params = matching_params.clone();
        facet_params.extend(facet_keys.iter().cloned().map(Value::Text));
        let mut facet_statement = connection.prepare(&facet_sql)?;
        let rows = facet_statement.query_map(params_from_iter(facet_params.iter()), |row| {
            Ok((
                row.get::<_, String>(0)?,
                metadata_value_from_storage(row.get_ref(1)?.as_str()?, row.get_ref(2)?.as_str()?)?,
            ))
        })?;

        for row in rows {
            let (key, value) = row?;
            if let Some(values) = facet_values.get_mut(&key) {
                values.push(value);
            }
        }
    }

    Ok(MetadataQueryResult {
        facets: facet_values
            .into_iter()
            .map(|(key, values)| MetadataFacet { key, values })
            .collect(),
        matching_paths,
    })
}

/// The SQL that scopes a path column to a folder, as one definition.
///
/// Both the metadata queries and the full-text search scope the same way, and
/// they have to agree: a prefix names a folder (or the note itself), never a
/// spelling, so `Journal` must not reach into `Journal-archive`. Written twice
/// the two would drift, and the drift would be a wrong result set rather than
/// anything that fails to build.
///
/// An empty prefix means the whole workspace, so a caller that does not scope
/// pays nothing.
pub(super) fn path_prefix_sql(column: &str, parameter: usize) -> String {
    format!(
        "(?{parameter} = '' \
         OR {column} = ?{parameter} \
         OR substr({column}, 1, length(?{parameter}) + 1) = ?{parameter} || '/')"
    )
}

/// Puts a caller's prefix in the spelling {@link path_prefix_sql} compares
/// against: indexed paths are workspace-relative and unslashed at both ends,
/// so `/Journal/` and `Journal` have to name the same folder.
pub(super) fn normalize_path_prefix(prefix: &str) -> String {
    prefix.trim_matches('/').to_string()
}

fn build_matching_sql(query: &MetadataQuery) -> (String, Vec<Value>) {
    let mut sql = format!(
        "SELECT DISTINCT d.path
         FROM documents_fts AS d
         WHERE {}",
        path_prefix_sql("d.path", 1)
    );
    let mut values = vec![Value::Text(normalize_path_prefix(&query.path_prefix))];

    for predicate in &query.predicates {
        let key_parameter = values.len() + 1;
        values.push(Value::Text(predicate.key.clone()));
        let (value_type, value_text) = predicate.value.storage_parts();
        let type_parameter = values.len() + 1;
        values.push(Value::Text(value_type.to_string()));
        let value_parameter = values.len() + 1;
        values.push(Value::Text(value_text));
        sql.push_str(&format!(
            " AND EXISTS (
                SELECT 1
                FROM document_metadata AS predicate_{key_parameter}
                WHERE predicate_{key_parameter}.path = d.path
                  AND predicate_{key_parameter}.field_key = ?{key_parameter}
                  AND predicate_{key_parameter}.value_type = ?{type_parameter}
                  AND predicate_{key_parameter}.value_text = ?{value_parameter}
            )"
        ));
    }

    (sql, values)
}

impl MetadataValue {
    fn storage_parts(&self) -> (&'static str, String) {
        match self {
            Self::String(value) => ("string", value.clone()),
            Self::Number(value) => ("number", value.to_string()),
        }
    }
}

fn metadata_value_from_storage(
    value_type: &str,
    value_text: &str,
) -> rusqlite::Result<MetadataValue> {
    match value_type {
        "string" => Ok(MetadataValue::String(value_text.to_string())),
        "number" => Number::from_str(value_text)
            .map(MetadataValue::Number)
            .map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(1, Type::Text, Box::new(error))
            }),
        unknown => Err(rusqlite::Error::FromSqlConversionFailure(
            0,
            Type::Text,
            Box::new(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("unsupported metadata value type {unknown:?}"),
            )),
        )),
    }
}

use super::{
    clear_documents, delete_document, index_document_records, init_index_schema, search_documents,
    SearchQuery,
    DocumentRecord,
};
use super::metadata::{
    query_metadata, MetadataFacet, MetadataField, MetadataPredicate, MetadataQuery, MetadataValue,
    INDEX_SCHEMA_VERSION,
};
use rusqlite::Connection;
use serde_json::Number;

fn index() -> Connection {
    let connection = Connection::open_in_memory().expect("in-memory database opens");
    init_index_schema(&connection).expect("schema initializes");
    connection
}

fn record(path: &str, metadata: Vec<MetadataField>) -> DocumentRecord {
    DocumentRecord {
        path: path.to_string(),
        file_name: path.rsplit('/').next().unwrap_or(path).to_string(),
        title: None,
        tags: Vec::new(),
        aliases: Vec::new(),
        body: "body".to_string(),
        metadata,
    }
}

fn field(key: &str, values: Vec<MetadataValue>) -> MetadataField {
    MetadataField {
        key: key.to_string(),
        values,
    }
}

fn text(value: &str) -> MetadataValue {
    MetadataValue::String(value.to_string())
}

fn number(value: f64) -> MetadataValue {
    MetadataValue::Number(Number::from_f64(value).expect("test number is finite"))
}

#[test]
fn predicates_must_match_the_same_document() {
    let mut connection = index();
    index_document_records(
        &mut connection,
        &[
            record(
                "journal/first.md",
                vec![field("project", vec![text("Atlas")])],
            ),
            record(
                "journal/second.md",
                vec![field("activity", vec![text("walk")])],
            ),
            record(
                "outside.md",
                vec![
                    field("project", vec![text("Atlas")]),
                    field("activity", vec![text("walk")]),
                ],
            ),
        ],
    )
    .expect("documents index");

    let result = query_metadata(
        &connection,
        &MetadataQuery {
            path_prefix: "journal".to_string(),
            facet_keys: vec!["project".to_string()],
            predicates: vec![
                MetadataPredicate {
                    key: "project".to_string(),
                    value: text("Atlas"),
                },
                MetadataPredicate {
                    key: "activity".to_string(),
                    value: text("walk"),
                },
            ],
        },
    )
    .expect("metadata query succeeds");

    assert!(result.matching_paths.is_empty());
    assert_eq!(
        result.facets,
        vec![MetadataFacet {
            key: "project".to_string(),
            values: Vec::new(),
        }]
    );
}

#[test]
fn queries_scope_paths_keys_values_and_flattened_types() {
    let mut connection = index();
    index_document_records(
        &mut connection,
        &[
            record(
                "journal/2026-01-01.md",
                vec![
                    field("project", vec![text("Atlas")]),
                    field("activities", vec![text("walk"), text("read"), text("walk")]),
                    field("rating", vec![number(4.5)]),
                ],
            ),
            record(
                "journal/2026-01-02.md",
                vec![
                    field("project", vec![text("Atlas")]),
                    field("activities", vec![text("read")]),
                    field("rating", vec![number(3.0)]),
                ],
            ),
            record(
                "journal-old/excluded.md",
                vec![
                    field("project", vec![text("Atlas")]),
                    field("activities", vec![text("excluded")]),
                ],
            ),
            record(
                "journal/string-number.md",
                vec![field("rating", vec![text("4.5")])],
            ),
        ],
    )
    .expect("documents index");

    let result = query_metadata(
        &connection,
        &MetadataQuery {
            path_prefix: "journal".to_string(),
            facet_keys: vec![
                "rating".to_string(),
                "activities".to_string(),
                "missing".to_string(),
                "activities".to_string(),
            ],
            predicates: vec![MetadataPredicate {
                key: "project".to_string(),
                value: text("Atlas"),
            }],
        },
    )
    .expect("metadata query succeeds");

    assert_eq!(
        result.matching_paths,
        vec![
            "journal/2026-01-01.md".to_string(),
            "journal/2026-01-02.md".to_string(),
        ]
    );
    assert_eq!(
        result.facets,
        vec![
            MetadataFacet {
                key: "activities".to_string(),
                values: vec![text("read"), text("walk")],
            },
            MetadataFacet {
                key: "missing".to_string(),
                values: Vec::new(),
            },
            MetadataFacet {
                key: "rating".to_string(),
                values: vec![number(3.0), number(4.5)],
            },
        ]
    );

    let numeric = query_metadata(
        &connection,
        &MetadataQuery {
            path_prefix: "journal".to_string(),
            facet_keys: Vec::new(),
            predicates: vec![MetadataPredicate {
                key: "rating".to_string(),
                value: number(4.5),
            }],
        },
    )
    .expect("numeric query succeeds");
    assert_eq!(
        numeric.matching_paths,
        vec!["journal/2026-01-01.md".to_string()]
    );
}

#[test]
fn updates_deletes_clears_and_rebuilds_with_documents() {
    let mut connection = index();
    index_document_records(
        &mut connection,
        &[record(
            "entry.md",
            vec![field("status", vec![text("draft")])],
        )],
    )
    .expect("first version indexes");
    index_document_records(
        &mut connection,
        &[record(
            "entry.md",
            vec![field("status", vec![text("published")])],
        )],
    )
    .expect("updated version indexes");

    let query = |connection: &Connection| {
        query_metadata(
            connection,
            &MetadataQuery {
                path_prefix: String::new(),
                facet_keys: vec!["status".to_string()],
                predicates: Vec::new(),
            },
        )
        .expect("metadata query succeeds")
    };
    assert_eq!(query(&connection).facets[0].values, vec![text("published")]);

    delete_document(&mut connection, "entry.md").expect("document deletes");
    assert!(query(&connection).matching_paths.is_empty());

    index_document_records(
        &mut connection,
        &[record(
            "rebuilt.md",
            vec![field("status", vec![text("restored")])],
        )],
    )
    .expect("rebuilt document indexes");
    clear_documents(&mut connection).expect("index clears");
    assert!(query(&connection).matching_paths.is_empty());
}

#[test]
fn schema_migrates_an_existing_fts_only_cache() {
    let mut connection = Connection::open_in_memory().expect("in-memory database opens");
    connection
        .execute_batch(
            "CREATE VIRTUAL TABLE documents_fts USING fts5(
                path UNINDEXED, file_name, title, tags, aliases, body
            );
            INSERT INTO documents_fts(path, file_name, title, tags, aliases, body)
            VALUES ('legacy.md', 'legacy.md', '', '', '', 'legacy searchable body');",
        )
        .expect("legacy schema initializes");

    init_index_schema(&connection).expect("schema migrates");

    assert_eq!(
        search_documents(
            &connection,
            &SearchQuery {
                text: "legacy",
                path_prefix: "",
                limit: 50
            }
        )
        .expect("search succeeds")
        .into_iter()
        .map(|hit| hit.path)
        .collect::<Vec<String>>(),
        vec!["legacy.md"]
    );
    assert_eq!(
        connection
            .query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))
            .expect("schema version reads"),
        INDEX_SCHEMA_VERSION
    );
    assert!(query_metadata(
        &connection,
        &MetadataQuery {
            path_prefix: String::new(),
            facet_keys: vec!["status".to_string()],
            predicates: Vec::new(),
        },
    )
    .expect("metadata query succeeds")
    .facets[0]
        .values
        .is_empty());

    clear_documents(&mut connection).expect("legacy cache clears for rebuild");
    index_document_records(
        &mut connection,
        &[record(
            "restored.md",
            vec![field("status", vec![text("restored")])],
        )],
    )
    .expect("metadata rebuilds from records");
    assert_eq!(
        query_metadata(
            &connection,
            &MetadataQuery {
                path_prefix: String::new(),
                facet_keys: vec!["status".to_string()],
                predicates: Vec::new(),
            },
        )
        .expect("metadata query succeeds")
        .facets[0]
        .values,
        vec![text("restored")]
    );
}

#[test]
fn schema_initialization_does_not_downgrade_a_future_version() {
    let connection = Connection::open_in_memory().expect("in-memory database opens");
    connection
        .pragma_update(None, "user_version", INDEX_SCHEMA_VERSION + 1)
        .expect("future schema version writes");

    init_index_schema(&connection).expect("schema initializes");

    assert_eq!(
        connection
            .query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))
            .expect("schema version reads"),
        INDEX_SCHEMA_VERSION + 1
    );
}

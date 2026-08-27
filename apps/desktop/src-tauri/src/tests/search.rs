//! Search index tests: indexing, matching, prefix/type-ahead, rebuild, delete,
//! malformed-query safety, and `path_prefix` scoping.
//!
//! The helpers `record`, `in_memory_index`, and `result_paths` live here because
//! they are only used by these tests.

use crate::commands::search::*;
use rusqlite::Connection;

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
        metadata: Vec::new(),
    }
}

fn in_memory_index() -> Connection {
    let connection = Connection::open_in_memory().expect("in-memory database opens");
    init_index_schema(&connection).expect("schema initializes");
    connection
}

fn result_paths(connection: &Connection, query: &str) -> Vec<String> {
    search_documents(
        connection,
        &SearchQuery {
            text: query,
            path_prefix: "",
            limit: 50,
        },
    )
    .expect("search succeeds")
    .into_iter()
    .map(|hit| hit.path)
    .collect()
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

    clear_documents(&mut connection).expect("index clears");
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

    delete_document(&mut connection, "removable.md").expect("document deletes");

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
    assert!(
        search_documents(
            &connection,
            &SearchQuery {
                text: "",
                path_prefix: "",
                limit: 50
            }
        )
        .expect("empty query is safe")
        .is_empty()
    );

    // FTS5 special syntax must be neutralized rather than raising an error.
    for malformed in ["\"", "*", "AND OR", "tag:", "(unbalanced", "a -b \"c"] {
        search_documents(
            &connection,
            &SearchQuery {
                text: malformed,
                path_prefix: "",
                limit: 50,
            },
        )
        .unwrap_or_else(|error| panic!("query {malformed:?} should not error: {error}"));
    }
}

/// The defect this closes: `LIMIT` ran against the whole vault, so a caller
/// asking about one folder got whatever of it survived a vault-wide ranking.
/// Scope has to be part of the query, not a filter applied to its output.
#[test]
fn a_path_prefix_scopes_the_search_before_the_limit_applies() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[
            record("Notes/a.md", "a.md", None, &[], &[], "standup"),
            record("Notes/b.md", "b.md", None, &[], &[], "standup"),
            record("Notes/c.md", "c.md", None, &[], &[], "standup"),
            record(
                "Journal/2026-08-13.md",
                "2026-08-13.md",
                None,
                &[],
                &[],
                "standup",
            ),
        ],
    )
    .expect("documents index");

    let hits = search_documents(
        &connection,
        &SearchQuery {
            text: "standup",
            path_prefix: "Journal",
            limit: 2,
        },
    )
    .expect("search succeeds");

    assert_eq!(
        hits.iter().map(|hit| hit.path.as_str()).collect::<Vec<_>>(),
        vec!["Journal/2026-08-13.md"]
    );
}

#[test]
fn a_path_prefix_matches_whole_folders_not_names_that_merely_start_with_it() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[
            record("Journal/today.md", "today.md", None, &[], &[], "entry"),
            record("Journal-archive/old.md", "old.md", None, &[], &[], "entry"),
            record("Journalling.md", "Journalling.md", None, &[], &[], "entry"),
        ],
    )
    .expect("documents index");

    // Leading and trailing slashes are trimmed, the way the metadata queries
    // already treat a prefix, so "/Journal/" and "Journal" name one folder.
    for prefix in ["Journal", "/Journal/"] {
        let hits = search_documents(
            &connection,
            &SearchQuery {
                text: "entry",
                path_prefix: prefix,
                limit: 50,
            },
        )
        .expect("search succeeds");

        assert_eq!(
            hits.iter().map(|hit| hit.path.as_str()).collect::<Vec<_>>(),
            vec!["Journal/today.md"],
            "prefix {prefix:?} should name a folder, not a spelling"
        );
    }
}

#[test]
fn an_empty_path_prefix_searches_the_whole_workspace() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[
            record("Journal/today.md", "today.md", None, &[], &[], "entry"),
            record("Notes/other.md", "other.md", None, &[], &[], "entry"),
        ],
    )
    .expect("documents index");

    let mut paths = search_documents(
        &connection,
        &SearchQuery {
            text: "entry",
            path_prefix: "",
            limit: 50,
        },
    )
    .expect("search succeeds")
    .into_iter()
    .map(|hit| hit.path)
    .collect::<Vec<_>>();
    paths.sort();

    assert_eq!(paths, vec!["Journal/today.md", "Notes/other.md"]);
}

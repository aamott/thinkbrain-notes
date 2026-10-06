//! Where one page of history continues.
//!
//! The cursor is versioned, opaque, and stateless: it pins the workspace, the
//! note scope, the *typed* roots the first page read -- which commit was the
//! imported source, which the private checkpoints -- and the next row, so a
//! continuation replays the same timeline even if the history grew or the
//! source ref moved meanwhile. Provenance is pinned, never re-inferred: a
//! fast-forwarded source ref cannot turn page-two `git` rows `local`.
//!
//! Nothing is cached or signed: a cursor is only a promise that "replay from
//! these roots and skip this many rows" is still a fair description of the
//! world, which is why every captured root is checked against the refs that
//! protect it before the walk replays.

use serde::{Deserialize, Serialize};

use crate::NativeError;

use super::history::{HistoryPage, Recorded};
use super::history_walk::{self, Roots};
use super::snapshot;

const CURSOR_VERSION: u32 = 1;
/// A cursor is a few commit ids, not a file. Refuse outright anything too big
/// to be one before it is decoded or allocates.
const MAX_CURSOR_BYTES: usize = 64 * 1024;

fn invalid_cursor() -> NativeError {
    NativeError::new(
        "sync.history_cursor_invalid",
        "This history continuation is not valid for this workspace. Refresh the list and try again.",
    )
}

/// Where one page continues. Serialized compactly: the names are load-bearing
/// inside the cursor, so they stay terse; the field names in [`CursorRoots`]
/// are the pinned *roles*, not positions in a list.
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Cursor {
    v: u32,
    /// Canonical workspace workdir, so a differently-spelled root path cannot
    /// borrow another workspace's continuation.
    ws: String,
    note: Option<String>,
    roots: CursorRoots,
    next: usize,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CursorRoots {
    #[serde(skip_serializing_if = "Option::is_none")]
    main: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    imported: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    checkpoints: Option<String>,
}

fn parse_hex(hex: &str) -> Result<gix::ObjectId, NativeError> {
    gix::ObjectId::from_hex(hex.as_bytes()).map_err(|_| invalid_cursor())
}

fn encode_cursor(cursor: &Cursor) -> Result<String, NativeError> {
    let json = serde_json::to_vec(cursor).map_err(|_| invalid_cursor())?;
    Ok(json.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn decode_cursor(encoded: &str) -> Result<(Cursor, Roots), NativeError> {
    if encoded.len() > MAX_CURSOR_BYTES {
        return Err(invalid_cursor());
    }
    if encoded.len() % 2 != 0 {
        return Err(invalid_cursor());
    }
    let bytes: Option<Vec<u8>> = (0..encoded.len())
        .step_by(2)
        .map(|at| {
            encoded
                .get(at..at + 2)
                .and_then(|pair| u8::from_str_radix(pair, 16).ok())
        })
        .collect();
    let cursor: Cursor =
        serde_json::from_slice(&bytes.ok_or_else(invalid_cursor)?).map_err(|_| invalid_cursor())?;
    if cursor.v != CURSOR_VERSION || cursor.ws.is_empty() {
        return Err(invalid_cursor());
    }
    let roots = Roots {
        main: cursor.roots.main.as_deref().map(parse_hex).transpose()?,
        imported: cursor
            .roots
            .imported
            .as_deref()
            .map(parse_hex)
            .transpose()?,
        checkpoints: cursor
            .roots
            .checkpoints
            .as_deref()
            .map(parse_hex)
            .transpose()?,
    };
    if roots.main.is_none() && roots.imported.is_none() && roots.checkpoints.is_none() {
        return Err(invalid_cursor());
    }
    Ok((cursor, roots))
}

/// The commits that root a fresh read: this workspace's own records, the
/// selected imported source, and -- for the per-note list only, since a
/// restore point is another version of a file -- the private checkpoints.
///
/// The destination is read live rather than remembered, so a link changed
/// while the engine is running selects the current source, not a stale one.
pub(super) fn current_roots(repo: &gix::Repository, per_note: bool) -> Result<Roots, NativeError> {
    let link = repo.workdir().and_then(|vault| {
        let home = super::settle::settings_home()?;
        super::round::destination(&home, vault)
    });
    Ok(Roots {
        main: snapshot::head_commit(repo)?,
        imported: super::history_source::selected_source(repo, link.as_deref())?,
        checkpoints: if per_note {
            snapshot::checkpoint_head(repo)?
        } else {
            None
        },
    })
}

/// The complete, ordered event list for `roots` -- the deterministic stream
/// a cursor replays. Pagination only ever slices this; nothing is truncated.
pub(super) fn events(
    repo: &gix::Repository,
    roots: &Roots,
    note: Option<&str>,
) -> Result<Vec<Recorded>, NativeError> {
    let nodes = history_walk::gather(repo, roots)?;
    match note {
        Some(note) => history_walk::note_events(repo, &nodes, std::path::Path::new(note)),
        None => history_walk::ledger_events(repo, &nodes),
    }
}

/// Whether every captured root is still inside this workspace's protected
/// history. The protected set -- every commit reachable from main, the
/// checkpoints, and all imported/retained source refs -- is computed once
/// with one shared visited set, then each captured root is just membership.
/// A root that stops being reachable -- deliberate cleanup -- expires the
/// cursor loudly rather than paging a graph that is no longer whole.
fn roots_protected(repo: &gix::Repository, roots: &Roots) -> Result<bool, NativeError> {
    let mut tips: Vec<gix::ObjectId> = super::history_ingest::source_tips(repo)?;
    if let Some(main) = snapshot::head_commit(repo)? {
        tips.push(main);
    }
    if let Some(checkpoints) = snapshot::checkpoint_head(repo)? {
        tips.push(checkpoints);
    }
    let protected = history_walk::ancestors(repo, &tips)?;
    Ok(roots
        .main
        .into_iter()
        .chain(roots.imported)
        .chain(roots.checkpoints)
        .all(|root| protected.contains(&root)))
}

/// Pages the history `repo` holds for `workspace`, continuing a validated
/// cursor. `workspace` is the canonical workdir the engine opened -- never a
/// caller-supplied alias, so cross-workspace cursors always fail.
pub(super) fn page(
    repo: &gix::Repository,
    workspace: &str,
    note: Option<&str>,
    limit: usize,
    cursor: Option<&str>,
) -> Result<HistoryPage, NativeError> {
    let (roots, offset) = match cursor {
        Some(encoded) => {
            let (cursor, roots) = decode_cursor(encoded)?;
            if cursor.ws != workspace || cursor.note.as_deref() != note {
                return Err(invalid_cursor());
            }
            if !roots_protected(repo, &roots)? {
                return Err(NativeError::new(
                    "sync.history_cursor_expired",
                    "This history view is out of date because old versions were cleaned up. Refresh the list and try again.",
                ));
            }
            (roots, cursor.next)
        }
        None => (current_roots(repo, note.is_some())?, 0),
    };

    let all = events(repo, &roots, note)?;
    if offset > all.len() {
        // An offset past the end means the stream the cursor captured is not
        // the stream that replayed -- a corrupt cursor, not an empty page.
        return Err(invalid_cursor());
    }
    let changes: Vec<Recorded> = all.iter().skip(offset).take(limit).cloned().collect();
    let next = offset + changes.len();
    let next_cursor = (next < all.len())
        .then(|| Cursor {
            v: CURSOR_VERSION,
            ws: workspace.to_string(),
            note: note.map(str::to_string),
            roots: CursorRoots {
                main: roots.main.map(|id| id.to_string()),
                imported: roots.imported.map(|id| id.to_string()),
                checkpoints: roots.checkpoints.map(|id| id.to_string()),
            },
            next,
        })
        .map(|cursor| encode_cursor(&cursor))
        .transpose()?;
    Ok(HistoryPage {
        changes,
        next_cursor,
    })
}

//! Reading recorded history back out of the hidden repository.
//!
//! One walk serves the whole timeline and a single note's version list:
//! every commit reachable from the given roots is decoded exactly once --
//! all parents, strictly, so malformed history fails rather than silently
//! truncating -- then sorted by the original commit time with generation
//! depth and the commit id as deterministic tie-breakers. There is no depth
//! cap: a cursor continuation must be able to promise that nothing was
//! skipped, which a walk that simply stops early cannot.
//!
//! Provenance is membership in the imported source's ancestry, not authorship
//! or message text: a commit reached from the imported root is `git`,
//! everything else is `local`. Reachability flags propagate across the
//! already-decoded parent edges, so a commit is never read twice. Dedup is
//! deliberately narrow -- consecutive events with identical content collapse,
//! but a real `A -> B -> A` revert and a delete/recreate both survive,
//! because history that erases a genuine return visit is lying about what
//! happened.

use std::collections::{BTreeSet, HashMap};
use std::path::Path;

use crate::NativeError;

use super::failed;
use super::history::ChangedNote;
use super::history::NoteChange;
use super::history::Recorded;
use super::history::Source;
use super::snapshot;

fn unreadable(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.history_read_failed",
        "Could not read the sync history.",
        error,
    )
}

/// Original committer seconds rendered as the app's milliseconds, or `None`
/// when the number cannot be represented rather than panicking on it.
pub fn millis(seconds: i64) -> Option<u64> {
    u64::try_from(seconds)
        .ok()
        .and_then(|s| s.checked_mul(1_000))
}

/// The typed entry points a history read starts from.
///
/// Roles matter to the reader, not just reachability: `imported` marks
/// provenance, `checkpoints` names commits whose trees are partial (a path
/// absent from one was never recorded, not deleted), and `main` is the
/// workspace's own timeline.
#[derive(Debug, Default, Clone)]
pub struct Roots {
    pub main: Option<gix::ObjectId>,
    pub imported: Option<gix::ObjectId>,
    pub checkpoints: Option<gix::ObjectId>,
}

impl Roots {
    fn all(&self) -> Vec<gix::ObjectId> {
        [self.main, self.imported, self.checkpoints]
            .into_iter()
            .flatten()
            .collect()
    }
}

/// One commit in the walk, decoded once.
#[derive(Debug)]
pub struct Node {
    pub id: gix::ObjectId,
    /// Original committer time in seconds; may predate the epoch.
    pub seconds: i64,
    pub message: String,
    pub tree: gix::ObjectId,
    pub parents: Vec<gix::ObjectId>,
    /// Whether this commit is reachable from the imported source root.
    pub imported: bool,
    /// Whether this commit is reached only through the checkpoint root --
    /// a partial snapshot in which an absent path means nothing.
    pub checkpoint_only: bool,
}

/// Decodes one commit, strictly: the object must exist, be a commit, verify,
/// and carry a readable time. Anything less is a broken history, not a gap
/// to step over.
fn decode(repo: &gix::Repository, id: gix::ObjectId) -> Result<Node, NativeError> {
    let object = repo.find_object(id).map_err(unreadable)?;
    if object.kind != gix::objs::Kind::Commit {
        return Err(unreadable(format!(
            "{id} is a {}, not a commit",
            object.kind
        )));
    }
    let data = gix::objs::Data::new(&object.data, object.kind, id.kind());
    data.verify_checksum(id.as_ref()).map_err(unreadable)?;
    let gix::objs::ObjectRef::Commit(commit) = data.decode().map_err(unreadable)? else {
        return Err(unreadable(format!("{id} did not decode as a commit")));
    };
    let committer = commit.committer().map_err(unreadable)?;
    let seconds = committer
        .time
        .split(' ')
        .next()
        .and_then(|seconds| seconds.parse::<i64>().ok())
        .ok_or_else(|| unreadable(format!("{id} has an unreadable commit time")))?;
    Ok(Node {
        id,
        seconds,
        message: commit.message.to_string(),
        tree: commit.tree(),
        parents: commit.parents().collect(),
        imported: false,
        checkpoint_only: false,
    })
}

/// The ids reachable from `start` through `map`'s already-decoded parents --
/// no object reads, just edges.
fn reach(
    map: &HashMap<gix::ObjectId, Node>,
    start: Option<gix::ObjectId>,
) -> BTreeSet<gix::ObjectId> {
    let mut found = BTreeSet::new();
    let mut stack: Vec<gix::ObjectId> = start.into_iter().collect();
    while let Some(id) = stack.pop() {
        if !found.insert(id) {
            continue;
        }
        if let Some(node) = map.get(&id) {
            stack.extend(node.parents.iter().copied());
        }
    }
    found
}

/// Every commit reachable from `roots`, newest first by original commit
/// time, generation depth and then commit id breaking ties so a page
/// boundary never depends on clock order.
///
/// Each object is decoded exactly once; `imported` and `checkpoint_only`
/// are then marked by propagating root roles across the decoded parent
/// edges. A commit reached through main or the imported source keeps that
/// meaning even if a checkpoint also reaches it -- the checkpoint role only
/// applies where it is the *only* route.
pub fn gather(repo: &gix::Repository, roots: &Roots) -> Result<Vec<Node>, NativeError> {
    let mut map: HashMap<gix::ObjectId, Node> = HashMap::new();
    let mut stack: Vec<gix::ObjectId> = roots.all();
    while let Some(id) = stack.pop() {
        if map.contains_key(&id) {
            continue;
        }
        let node = decode(repo, id)?;
        stack.extend(node.parents.iter().copied());
        map.insert(id, node);
    }

    let imported = reach(&map, roots.imported);
    let own: BTreeSet<gix::ObjectId> = reach(&map, roots.main).union(&imported).copied().collect();
    let via_checkpoints = reach(&map, roots.checkpoints);
    for node in map.values_mut() {
        node.imported = imported.contains(&node.id);
        node.checkpoint_only = via_checkpoints.contains(&node.id) && !own.contains(&node.id);
    }

    let mut nodes: Vec<Node> = map.into_values().collect();
    // Order: original commit time, newest first. When clocks tie -- skewed
    // machines, two commits in one second -- generation depth keeps a
    // descendant above its ancestors, and the commit id is the final
    // deterministic tie-breaker.
    let depth = generations(&nodes);
    nodes.sort_by(|a, b| {
        b.seconds
            .cmp(&a.seconds)
            .then_with(|| depth[&b.id].cmp(&depth[&a.id]))
            .then_with(|| b.id.cmp(&a.id))
    });
    Ok(nodes)
}

/// Longest-path depth of every gathered commit: a commit's generation is one
/// more than its deepest parent's. Iterative post-order so a long history
/// cannot overflow the stack.
fn generations(nodes: &[Node]) -> HashMap<gix::ObjectId, u32> {
    let by_id: HashMap<gix::ObjectId, &Node> = nodes.iter().map(|node| (node.id, node)).collect();
    let mut depth = HashMap::new();
    let mut stack: Vec<gix::ObjectId> = nodes.iter().map(|node| node.id).collect();
    while let Some(id) = stack.pop() {
        if depth.contains_key(&id) {
            continue;
        }
        let node = by_id[&id];
        if node
            .parents
            .iter()
            .all(|parent| !by_id.contains_key(parent) || depth.contains_key(parent))
        {
            let highest = node
                .parents
                .iter()
                .filter_map(|parent| depth.get(parent))
                .copied()
                .max()
                .unwrap_or(0);
            depth.insert(id, highest + 1);
        } else {
            stack.push(id);
            stack.extend(node.parents.iter().copied());
        }
    }
    depth
}

/// The union of commits reachable from `tips`, decoded once into a shared
/// set -- used to prove a captured root is still protected by current refs.
pub fn ancestors(
    repo: &gix::Repository,
    tips: &[gix::ObjectId],
) -> Result<BTreeSet<gix::ObjectId>, NativeError> {
    let mut found = BTreeSet::new();
    let mut stack: Vec<gix::ObjectId> = tips.to_vec();
    while let Some(id) = stack.pop() {
        if !found.insert(id) {
            continue;
        }
        // `decode` rejects anything that is not a commit: a tip naming a tag
        // or a blob is a broken ref, not a shorter history.
        let node = decode(repo, id)?;
        stack.extend(node.parents.iter().copied());
    }
    Ok(found)
}

/// The blob `path` names in `tree`, or `None` when absent or not a blob.
fn blob_at(
    repo: &gix::Repository,
    tree: gix::ObjectId,
    path: &Path,
) -> Result<Option<gix::ObjectId>, NativeError> {
    let mut tree = tree_at(repo, tree)?;
    let entry = tree.peel_to_entry_by_path(path).map_err(unreadable)?;
    Ok(entry.and_then(|entry| entry.mode().is_blob().then(|| entry.object_id())))
}

fn tree_at(repo: &gix::Repository, tree: gix::ObjectId) -> Result<gix::Tree<'_>, NativeError> {
    if tree == gix::ObjectId::empty_tree(repo.object_hash()) {
        return Ok(repo.empty_tree());
    }
    repo.find_tree(tree).map_err(unreadable)
}

/// The blob `path` names in the tree `commit` recorded.
fn blob_at_commit(
    repo: &gix::Repository,
    commit: gix::ObjectId,
    path: &Path,
) -> Result<Option<gix::ObjectId>, NativeError> {
    blob_at(repo, snapshot::tree_of(repo, Some(commit))?, path)
}

/// One note's versions across `nodes`, newest first.
///
/// A commit only becomes a version when its blob for the path differs from
/// what every parent held -- a merge that keeps a parent's content wholesale
/// inherits it instead of restating it. Deletion rows are omitted (there is
/// nothing to restore to) but a real deletion -- a main or imported commit
/// that drops a path a parent held -- resets the dedupe state, so content
/// returning afterwards is a version again. Checkpoint trees are partial:
/// absence in a checkpoint-only commit is neither a deletion nor a reset,
/// and a path absent on an independent history that never had it is just
/// absent, not removed.
pub fn note_events(
    repo: &gix::Repository,
    nodes: &[Node],
    note: &Path,
) -> Result<Vec<Recorded>, NativeError> {
    let mut events = Vec::new();
    let mut last_blob: Option<gix::ObjectId> = None;
    for node in nodes {
        let blob = blob_at(repo, node.tree, note)?;
        let mut parent_blobs = Vec::with_capacity(node.parents.len());
        for parent in &node.parents {
            parent_blobs.push(blob_at_commit(repo, *parent, note)?);
        }
        let Some(blob) = blob else {
            // A real deletion resets dedupe so a recreate of even identical
            // bytes is a version again. Checkpoint-only absence -- a partial
            // tree that never held the path -- is not a deletion, and neither
            // is a history that simply never recorded the file.
            if !node.checkpoint_only && parent_blobs.iter().any(Option::is_some) {
                last_blob = None;
            }
            continue;
        };

        // A merge whose result any parent already held is inheritance, not a
        // version; a merge that produced content no parent had is real. A
        // commit that changed nothing emits nothing either way -- and must not
        // prime the dedupe state, or the unchanged copy would swallow the real
        // version that introduced the content.
        if parent_blobs.contains(&Some(blob)) {
            continue;
        }
        if last_blob == Some(blob) {
            continue;
        }
        last_blob = Some(blob);
        events.push(Recorded {
            id: node.id.to_string(),
            at: millis(node.seconds),
            message: node.message.clone(),
            notes: vec![ChangedNote {
                path: note.to_string_lossy().replace('\\', "/"),
                change: if parent_blobs.iter().all(Option::is_none) {
                    NoteChange::Added
                } else {
                    NoteChange::Updated
                },
            }],
            source: if node.imported {
                Source::Git
            } else {
                Source::Local
            },
        });
    }
    Ok(events)
}

/// The vault-wide ledger across `nodes`, newest first.
///
/// The first-parent diff decides what a change touched; a merge that keeps
/// the note content of a parent still records which files moved. Nothing is
/// deduplicated here: shared commits already arrive once (the walk dedupes
/// commit ids), and two successive edits that touch the same path are two
/// distinct events, not one.
pub fn ledger_events(repo: &gix::Repository, nodes: &[Node]) -> Result<Vec<Recorded>, NativeError> {
    let mut state = gix::diff::tree::State::default();
    let mut events = Vec::new();
    for node in nodes {
        let notes = touched(repo, &mut state, node.parents.first().copied(), node.id)?;
        if notes.is_empty() {
            continue;
        }
        events.push(Recorded {
            id: node.id.to_string(),
            at: millis(node.seconds),
            message: node.message.clone(),
            notes,
            source: if node.imported {
                Source::Git
            } else {
                Source::Local
            },
        });
    }
    Ok(events)
}

/// The notes one commit touched, in the vocabulary the list speaks.
fn touched(
    repo: &gix::Repository,
    state: &mut gix::diff::tree::State,
    parent: Option<gix::ObjectId>,
    commit: gix::ObjectId,
) -> Result<Vec<ChangedNote>, NativeError> {
    let changes = snapshot::changes_between(
        repo,
        state,
        snapshot::tree_of(repo, parent)?,
        snapshot::tree_of(repo, Some(commit))?,
    )?;
    let mut notes: Vec<ChangedNote> = changes
        .into_iter()
        .filter_map(|record| {
            use gix::diff::tree::recorder::Change;
            let (mode, path, change) = match record {
                Change::Addition {
                    entry_mode, path, ..
                } => (entry_mode, path, NoteChange::Added),
                Change::Deletion {
                    entry_mode, path, ..
                } => (entry_mode, path, NoteChange::Removed),
                Change::Modification {
                    entry_mode, path, ..
                } => (entry_mode, path, NoteChange::Updated),
            };
            mode.is_blob().then(|| ChangedNote {
                path: path.to_string(),
                change,
            })
        })
        .collect();
    notes.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(notes)
}

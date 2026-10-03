//! Copying established Git history into the hidden repository.
//!
//! Whether the history arrives over the network or sits in the vault's own
//! `.git`, it lands the same way: every object reachable from the source's
//! tip is fully decoded and checksum-verified, then copied byte-for-byte, and
//! only then is a private source ref pointed at the tip. The ref lives under
//! `refs/thinkbrain/sources/`, outside `refs/heads/`, so an imported root can
//! never be mistaken for the workspace's own recorded history -- and so a
//! failed or interrupted copy leaves loose objects, never a moved ref.
//!
//! When a source's tip moves to history that does not contain the old tip --
//! a rewrite, a reclone, a different upstream -- the displaced root is kept
//! under `refs/thinkbrain/sources/retained/`, never grafted onto anything.
//!
//! The source is only ever read. A workspace-local repository is opened
//! through its worktree and nothing in `.git` is touched; a remote's objects
//! arrive through `network::fetch`, which remains the transport, and the same
//! copy path then runs with the hidden repository as its own source.

use std::collections::BTreeMap;
use std::path::Path;

use gix::objs::Write as _;
use gix::refs::transaction::{Change, PreviousValue, RefEdit};
use gix::refs::{FullName, Target};

use crate::NativeError;

use super::failed;

/// Where imported source roots live -- every durable imported-history ref.
pub const SOURCE_REF_PREFIX: &str = "refs/thinkbrain/sources/";

/// The source ref for a vault's own `.git`, when there is no configured link.
pub const WORKSPACE_SOURCE_REF: &str = "refs/thinkbrain/sources/workspace-git";

/// What one completed import did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ingested {
    /// The commit the imported source ref now names.
    pub tip: gix::ObjectId,
    /// Reachable objects the copy visited, shared ones included -- `write_buf`
    /// deduplicates on disk, so this counts the graph, not the bytes moved.
    pub objects: usize,
    /// The source ref that was created or updated.
    pub reference: String,
}

/// The source ref for a configured git link, keyed like the workspace's other
/// app-data so one link's history cannot collide with another's.
pub fn remote_source_ref(destination: &str) -> String {
    let normalized = super::normalize_destination(destination);
    let key = crate::commands::workspace::stable_workspace_hash(&normalized);
    format!("{SOURCE_REF_PREFIX}git-link-{key:016x}")
}

fn invalid(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.git_history_invalid",
        "Could not read this workspace's Git history.",
        error,
    )
}

fn incomplete(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.git_history_incomplete",
        "This Git history is incomplete. Fetch its missing history and try again.",
        error,
    )
}

fn unsupported(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.git_history_unsupported",
        "This Git repository uses a history format ThinkBrain cannot import.",
        error,
    )
}

fn copy_failed(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.git_history_ingest_failed",
        "Could not copy Git history into ThinkBrain's private history.",
        error,
    )
}

/// Imports the vault's own Git repository, if it has one worth importing.
///
/// `Ok(None)` covers the two histories there is nothing to copy: no `.git`,
/// and a repository that has never been committed to. Anything *broken* --
/// an unreadable `.git`, a shallow clone, a detached HEAD, a different
/// object hash -- is an error, because silently falling back to a bare
/// snapshot would hide history the user asked Git to keep.
pub fn ingest_workspace_git(
    hidden: &gix::Repository,
    vault: &Path,
) -> Result<Option<Ingested>, NativeError> {
    // `symlink_metadata`, not `exists()`: a broken `.git` link is a source
    // that must fail loudly on open, not a quietly absent one, and a `.git`
    // that cannot even be stat'ed is a read failure.
    match std::fs::symlink_metadata(vault.join(".git")) {
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(invalid(error)),
    }
    let source = gix::open(vault).map_err(invalid)?;
    if source.object_hash() != hidden.object_hash() {
        return Err(unsupported(format!(
            "the repository uses a different object hash ({:?})",
            source.object_hash()
        )));
    }
    if source.is_shallow() {
        return Err(incomplete(
            "the repository is a shallow clone, so older objects were never fetched",
        ));
    }
    let head = source.head().map_err(invalid)?;
    if head.is_detached() {
        return Err(NativeError::new(
            "sync.git_history_unsupported",
            "This repository's Git history is not on a branch. Check out its default branch and try again.",
        ));
    }
    let Some(tip) = head.id().map(|id| id.detach()) else {
        // "Never committed" only holds when nothing carries commits at all.
        // An unborn HEAD on a repo whose other refs have real history --
        // a default-branch mismatch, a HEAD left pointing at a deleted
        // branch -- must fail loudly rather than hide that history behind
        // a bare snapshot.
        if carries_commits(&source)? {
            return Err(NativeError::new(
                "sync.git_history_unsupported",
                "This repository's checked-out branch has no commits, but others do. Check out a branch with history or commit, and try again.",
            ));
        }
        return Ok(None);
    };

    // The source ref already names this tip -- the last import is still
    // current, so the decode-and-verify pass does not run on every attach.
    if let Some(mut found) = hidden
        .try_find_reference(WORKSPACE_SOURCE_REF)
        .map_err(invalid)?
    {
        if found.peel_to_id().map_err(invalid)?.detach() == tip {
            return Ok(Some(Ingested {
                tip,
                objects: 0,
                reference: WORKSPACE_SOURCE_REF.to_string(),
            }));
        }
    }

    Ok(Some(retain(
        &source,
        hidden,
        tip,
        WORKSPACE_SOURCE_REF,
        NoInterrupt,
    )?))
}

/// Whether any ref in `repo` names a commit -- `HEAD` never counts itself:
/// the refs iteration reports its symbolic name, which does not resolve.
fn carries_commits(repo: &gix::Repository) -> Result<bool, NativeError> {
    let platform = repo.references().map_err(invalid)?;
    let iter = platform.all().map_err(invalid)?;
    for reference in iter {
        let mut reference = reference.map_err(invalid)?;
        let Ok(id) = reference.peel_to_id() else {
            continue;
        };
        let is_commit = repo
            .find_object(id.detach())
            .map(|object| object.kind == gix::objs::Kind::Commit)
            .unwrap_or(false);
        if is_commit {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Retains a fetched tip under its destination-hashed source ref.
///
/// Runs the same validate-then-copy path as a workspace-local import, with
/// the hidden repository as both source and destination: the objects a fetch
/// just wrote are re-verified before the durable ref moves, so a partial or
/// corrupt pack can never point a source ref at history that is not whole.
pub fn retain_fetched(
    hidden: &gix::Repository,
    destination: &str,
    tip: gix::ObjectId,
) -> Result<Ingested, NativeError> {
    retain(
        hidden,
        hidden,
        tip,
        &remote_source_ref(destination),
        NoInterrupt,
    )
}

/// The tips every imported source ref currently names.
///
/// A ref that cannot be resolved is an error, not an empty result: returning
/// fewer tips would let maintenance delete the history that ref claims.
pub fn source_tips(repo: &gix::Repository) -> Result<Vec<gix::ObjectId>, NativeError> {
    let mut tips = Vec::new();
    let platform = repo.references().map_err(invalid)?;
    let iter = platform.prefixed(SOURCE_REF_PREFIX).map_err(invalid)?;
    for found in iter {
        let mut found = found.map_err(invalid)?;
        let id = found.peel_to_id().map_err(invalid)?;
        tips.push(id.detach());
    }
    Ok(tips)
}

/// Interruption point for the second pass. Production uses [`NoInterrupt`];
/// tests can hook it to prove a mid-copy failure moves no ref.
trait Interrupt {
    fn after_each(&self, copied: usize) -> Result<(), NativeError>;
}

struct NoInterrupt;
impl Interrupt for NoInterrupt {
    fn after_each(&self, _copied: usize) -> Result<(), NativeError> {
        Ok(())
    }
}

/// Validates then copies the graph reachable from `tip`, then -- and only
/// then -- points `reference` at it. Never touches `refs/heads/`.
fn retain(
    source: &gix::Repository,
    destination: &gix::Repository,
    tip: gix::ObjectId,
    reference: &str,
    interrupt: impl Interrupt,
) -> Result<Ingested, NativeError> {
    let objects = collect_reachable(source, tip)?;

    // Pass 2: copy the validated objects byte-for-byte, re-verifying each
    // checksum on this read so a source that changed between passes is caught
    // before it is trusted. A copy that stops here leaves unreachable loose
    // objects behind, which maintenance reaps -- what it must not do is move
    // the ref, so the ref transaction stays last.
    let mut copied = 0;
    for (id, kind) in &objects {
        let object = source.find_object(*id).map_err(incomplete)?;
        gix::objs::Data::new(&object.data, object.kind, id.kind())
            .verify_checksum(id.as_ref())
            .map_err(incomplete)?;
        let written = destination
            .write_buf(*kind, &object.data)
            .map_err(copy_failed)?;
        if written != *id {
            return Err(unsupported(format!(
                "writing {id} produced {written}, so this object format is not one ThinkBrain can keep"
            )));
        }
        copied += 1;
        interrupt.after_each(copied)?;
    }

    publish(destination, reference, tip, &objects)?;

    Ok(Ingested {
        tip,
        objects: objects.len(),
        reference: reference.to_string(),
    })
}

/// Points `reference` at `tip`, archiving the ref's previous tip if the new
/// graph does not contain it.
///
/// A rewritten or replaced source must not orphan the history it previously
/// imported: a displaced root moves under `retained/<identity>/<oid>` so it
/// stays reachable for version history without being grafted into anything.
/// gix's multi-file ref commit is not crash-atomic, so the archive edit comes
/// first: if the commit stops midway, the old root is still retained before
/// the identity can move. No archive is written when nothing was copied.
fn publish(
    destination: &gix::Repository,
    reference: &str,
    tip: gix::ObjectId,
    objects: &BTreeMap<gix::ObjectId, gix::objs::Kind>,
) -> Result<(), NativeError> {
    let name = FullName::try_from(reference).map_err(copy_failed)?;
    let previous = destination
        .try_find_reference(reference)
        .map_err(invalid)?
        .map(|mut found| found.peel_to_id().map(|id| id.detach()).map_err(invalid))
        .transpose()?;

    let mut edits = Vec::new();
    // The archive edit is deliberately first in the transaction: a partially
    // committed transaction then keeps the old root rather than losing it.
    if let Some(previous) =
        previous.filter(|previous| *previous != tip && !objects.contains_key(previous))
    {
        let suffix = reference
            .strip_prefix(SOURCE_REF_PREFIX)
            .unwrap_or(reference);
        let archive = format!("{SOURCE_REF_PREFIX}retained/{suffix}/{previous}");
        edits.push(RefEdit {
            change: Change::Update {
                log: Default::default(),
                // The OID is in the ref name, so this ref can only ever name
                // that OID; Any is safe.
                expected: PreviousValue::Any,
                new: Target::Object(previous),
            },
            name: FullName::try_from(archive).map_err(copy_failed)?,
            deref: false,
        });
    }
    edits.push(RefEdit {
        change: Change::Update {
            log: Default::default(),
            expected: previous
                .map(|tip| PreviousValue::MustExistAndMatch(Target::Object(tip)))
                .unwrap_or(PreviousValue::MustNotExist),
            new: Target::Object(tip),
        },
        name,
        deref: false,
    });
    destination.edit_references(edits).map_err(copy_failed)?;
    Ok(())
}

/// First pass: decodes and checksum-verifies every object reachable from
/// `tip`, recording `(id, kind)` without writing anything. A missing object,
/// a bad checksum, or an object whose kind disagrees with the reference that
/// named it means the history is incomplete, and no object is copied at all.
fn collect_reachable(
    source: &gix::Repository,
    tip: gix::ObjectId,
) -> Result<BTreeMap<gix::ObjectId, gix::objs::Kind>, NativeError> {
    // The advertised tip names a commit: a missing tip is an incomplete
    // history; a present non-commit tip (a tag object, a bare tree) is a
    // shape this path does not import.
    let tip_object = source.find_object(tip).map_err(incomplete)?;
    if tip_object.kind != gix::objs::Kind::Commit {
        return Err(unsupported(format!("the tip {tip} is not a commit")));
    }

    let mut objects = BTreeMap::new();
    let mut stack = vec![(tip, gix::objs::Kind::Commit)];
    while let Some((id, expected)) = stack.pop() {
        if let Some(found) = objects.get(&id) {
            if *found != expected {
                return Err(incomplete(format!(
                    "{id} is named as both {expected} and {found}"
                )));
            }
            continue;
        }
        let object = source.find_object(id).map_err(incomplete)?;
        if object.kind != expected {
            return Err(incomplete(format!(
                "{id} is a {} where a {expected} was named",
                object.kind
            )));
        }
        let data = gix::objs::Data::new(&object.data, object.kind, id.kind());
        data.verify_checksum(id.as_ref()).map_err(incomplete)?;
        let decoded = data.decode().map_err(incomplete)?;
        objects.insert(id, expected);
        match decoded {
            gix::objs::ObjectRef::Commit(commit) => {
                stack.push((commit.tree(), gix::objs::Kind::Tree));
                stack.extend(
                    commit
                        .parents()
                        .map(|parent| (parent, gix::objs::Kind::Commit)),
                );
            }
            gix::objs::ObjectRef::Tree(tree) => {
                for entry in &tree.entries {
                    // Gitlinks name a commit in a repository this one has
                    // never had; real git skips them for the same reason.
                    if entry.mode.is_commit() {
                        continue;
                    }
                    let kind = if entry.mode.is_tree() {
                        gix::objs::Kind::Tree
                    } else {
                        gix::objs::Kind::Blob
                    };
                    stack.push((entry.oid.to_owned(), kind));
                }
            }
            gix::objs::ObjectRef::Tag(tag) => {
                stack.push((tag.target(), tag.target_kind));
            }
            gix::objs::ObjectRef::Blob(_) => {}
        }
    }
    Ok(objects)
}

#[cfg(test)]
#[path = "history_ingest_tests.rs"]
pub(super) mod tests;

#[cfg(test)]
#[path = "history_ingest_safety_tests.rs"]
mod safety_tests;

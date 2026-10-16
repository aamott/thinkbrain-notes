//! The version both sides of a conflict grew from — or an honest "none".
//!
//! A three-way merge is only as good as its base. A pull knows the base
//! exactly: the merge computed it, and the copy carries its id. A sync daemon
//! hands over two files and no ancestor, so one is chosen from the note's
//! recorded versions — and chosen by what merging against it could lose, not
//! by how similar it looks.
//!
//! The danger is one-sided. Where ours equals the base and theirs does not,
//! the merge takes theirs without asking. With the true base that is their
//! genuine edit; with a base that is too new, it is our edit being silently
//! undone. A base that is too old only turns clean regions into questions. So
//! every candidate is scored by those risky hunks, the fewest wins, and a tie
//! goes to the older one.
//!
//! Nothing is pinned. The recorded chain is the store, so the answer is worked
//! out again whenever a conflict is opened, and survives restarts the same way
//! the history does.

use std::collections::HashSet;
use std::ops::Range;
use std::path::Path;
use std::time::UNIX_EPOCH;

use gix::diff::blob::{Algorithm, Diff, InternedInput, sources::byte_lines};
use serde::Serialize;

use crate::NativeError;

use super::conflict::ConflictCopy;
use super::engine::Engine;
use super::history_read_failed;
use super::snapshot;

/// The most distinct recorded versions scored for one conflict, newest kept.
///
/// Each costs two line diffs. Dropping the oldest beyond this only removes
/// options, and a missing option means a question, never a wrong merge.
const CANDIDATES: usize = 200;

/// How much later than the copy's mtime its arrival may really have been,
/// because that time can come from another device's clock.
///
/// Two minutes covers devices keeping network time with room to spare;
/// excluding more is the safe direction, since a too-old base only adds
/// questions and is never proven unless nothing is risky.
pub(super) const ARRIVAL_SKEW_SECS: i64 = 120;

/// How far a merge against the base can be trusted — a property of what that
/// merge would do, not of where the base came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Confidence {
    /// The merge cannot drop a line of ours: no risky hunks.
    Proven,
    /// Somewhere the merge would take theirs where ours never moved. That may
    /// be their real edit or ours being undone; a person has to look.
    Ambiguous,
}

/// Where the base was found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BaseSource {
    /// The ancestor the pull's own merge used for this note.
    Merge,
    /// A version of the note this vault recorded before the copy arrived.
    Recorded,
}

/// A conflict's base, as the merge view is told about it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeBase {
    /// The base's blob id. An opaque handle to the frontend.
    pub id: String,
    pub source: BaseSource,
    pub confidence: Confidence,
    /// Places the merge would take theirs where ours equals the base.
    pub risky_hunks: usize,
}

/// The winning candidate, by its position in the list it was chosen from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Choice {
    pub index: usize,
    pub confidence: Confidence,
    pub risky: usize,
}

/// The base for a conflict being opened, or `None` when there is none to name
/// — including a keep-or-delete decision, which has no second version.
///
/// A failure to read the history is logged and answered with `None`: being
/// unable to name a base means both versions go to a person, which is never
/// wrong, and it must not stop the conflict from opening at all.
pub fn open(
    engine: &Engine,
    root: &Path,
    pairing: &ConflictCopy,
    ours: &[u8],
    theirs: &[u8],
) -> Option<MergeBase> {
    if super::conflict::is_deletion_decision(&pairing.copy) {
        return None;
    }
    // A pull noted the copy with its base; the pairing derived from the name
    // alone cannot know it.
    let noted = engine
        .conflicts()
        .into_iter()
        .find(|known| known.copy == pairing.copy && known.original == pairing.original)
        .and_then(|known| known.base);
    let pairing = ConflictCopy {
        base: noted.or(pairing.base),
        ..pairing.clone()
    };
    derive(&engine.repository(), root, &pairing, ours, theirs).unwrap_or_else(|error| {
        eprintln!(
            "[sync] merge base not derived for {}: {error:?}",
            pairing.copy
        );
        None
    })
}

/// The base for `pairing`, judged against `ours` and `theirs`.
///
/// The merge's own base when the copy carries one, the copy still holds the
/// content it was noted for, and the base is readable; otherwise the best
/// recorded version of the note from before the copy arrived. `theirs` is the
/// copy's content as just read, so the check needs no lock and no other read.
pub fn derive(
    repo: &gix::Repository,
    root: &Path,
    pairing: &ConflictCopy,
    ours: &[u8],
    theirs: &[u8],
) -> Result<Option<MergeBase>, NativeError> {
    let as_noted = |written| match gix::objs::compute_hash(
        repo.object_hash(),
        gix::object::Kind::Blob,
        theirs,
    ) {
        Ok(id) if id == written => true,
        Ok(_) => {
            eprintln!(
                "[sync] noted merge base set aside for {}: the copy changed since it was noted",
                pairing.copy
            );
            false
        }
        Err(error) => {
            eprintln!(
                "[sync] noted merge base set aside for {}: the copy could not be hashed: {error:?}",
                pairing.copy
            );
            false
        }
    };
    if let Some(noted) = pairing.base.filter(|noted| as_noted(noted.written)) {
        let id = noted.id;
        if let Ok(object) = repo.find_object(id) {
            let (confidence, risky_hunks) = judge(ours, &object.data, theirs);
            return Ok(Some(MergeBase {
                id: id.to_string(),
                source: BaseSource::Merge,
                confidence,
                risky_hunks,
            }));
        }
    }

    let Some(arrived) = arrival(&root.join(&pairing.copy)) else {
        return Ok(None);
    };
    let candidates = recorded_before(repo, Path::new(&pairing.original), arrived)?;
    let texts: Vec<&[u8]> = candidates
        .iter()
        .map(|(_, bytes)| bytes.as_slice())
        .collect();
    Ok(select(ours, theirs, &texts).map(|choice| MergeBase {
        id: candidates[choice.index].0.to_string(),
        source: BaseSource::Recorded,
        confidence: choice.confidence,
        risky_hunks: choice.risky,
    }))
}

/// Picks among `candidates`, oldest first: fewest risky hunks, the earlier
/// candidate on a tie.
pub fn select(ours: &[u8], theirs: &[u8], candidates: &[&[u8]]) -> Option<Choice> {
    let mut best: Option<Choice> = None;
    for (index, base) in candidates.iter().enumerate() {
        let (confidence, risky) = judge(ours, base, theirs);
        // Strictly fewer, so an equal score never displaces an older one.
        if best.is_none_or(|best| risky < best.risky) {
            best = Some(Choice {
                index,
                confidence,
                risky,
            });
        }
    }
    best
}

/// How far merging `ours` and `theirs` against `base` can be trusted, and how
/// many risky hunks — theirs differing where ours equals the base — say so.
///
/// Proven only when there are none. Theirs only adding lines is no proof:
/// against a base that already lacks a line we deleted, their copy of that line
/// looks like an insertion, and taking it would bring our deletion back.
pub fn judge(ours: &[u8], base: &[u8], theirs: &[u8]) -> (Confidence, usize) {
    let risky = count_risky(&hunks(base, ours), &hunks(base, theirs));
    let confidence = if risky == 0 {
        Confidence::Proven
    } else {
        Confidence::Ambiguous
    };
    (confidence, risky)
}

type Hunk = (Range<u32>, Range<u32>);

/// Line hunks from `before` to `after`, the way the text merge computes them:
/// Myers over byte lines, post-processed for line sliders.
fn hunks(before: &[u8], after: &[u8]) -> Vec<Hunk> {
    let input = InternedInput::new(byte_lines(before), byte_lines(after));
    let mut diff = Diff::compute(Algorithm::Myers, &input);
    diff.postprocess_lines(&input);
    diff.hunks().map(|hunk| (hunk.before, hunk.after)).collect()
}

/// Their hunks that touch none of ours, in base lines.
///
/// Touching is the text merge's own rule: one hunk starts inside the other, or
/// both start at the same line (which is how an insertion meets an edit).
/// Mirrors `left_overlaps_right` in gix-merge's text `take_intersecting`.
fn count_risky(ours: &[Hunk], theirs: &[Hunk]) -> usize {
    theirs
        .iter()
        .filter(|(mine, _)| {
            // Ours are sorted and disjoint, so only the neighbours of where
            // this hunk starts can touch it.
            let next = ours.partition_point(|(other, _)| other.start < mine.start);
            let before = next
                .checked_sub(1)
                .is_some_and(|index| mine.start < ours[index].0.end);
            let after = ours
                .get(next)
                .is_some_and(|(other, _)| other.start == mine.start || other.start < mine.end);
            !before && !after
        })
        .count()
}

/// The latest second a version may have been recorded in and still predate
/// the copy: its modification time, less [`ARRIVAL_SKEW_SECS`].
///
/// That clock may be another device's, so the bound is loose on purpose, and it
/// is used with a strict `<`. Both err towards excluding a version — a missing
/// candidate becomes a question, never a lost edit.
fn arrival(copy: &Path) -> Option<i64> {
    let modified = std::fs::metadata(copy).ok()?.modified().ok()?;
    let seconds = i64::try_from(modified.duration_since(UNIX_EPOCH).ok()?.as_secs()).ok()?;
    Some(seconds - ARRIVAL_SKEW_SECS)
}

/// The distinct versions of `note` recorded strictly before `arrived`, oldest
/// first, each placed where it was first recorded.
///
/// Later versions are excluded outright: the daemon writes its winner over the
/// note when the pair arrives, and a snapshot of that is not an ancestor of
/// either side. The walk shares `has_recorded`'s bound, so very old versions
/// are simply not offered.
fn recorded_before(
    repo: &gix::Repository,
    note: &Path,
    arrived: i64,
) -> Result<Vec<(gix::ObjectId, Vec<u8>)>, NativeError> {
    fn unreadable(error: impl std::fmt::Display) -> NativeError {
        history_read_failed("Could not read the sync history.", error)
    }
    let mut newest_first = Vec::new();
    for commit in super::history_walk::first_parent_chain(
        repo,
        snapshot::head_commit(repo)?,
        super::history::SCAN,
    ) {
        let commit = commit?;
        // A time that cannot be read cannot be shown to predate the copy.
        if commit.time().map_or(true, |time| time.seconds >= arrived) {
            continue;
        }
        let entry = commit
            .tree()
            .map_err(unreadable)?
            .peel_to_entry_by_path(note)
            .map_err(unreadable)?;
        if let Some(entry) = entry.filter(|entry| entry.mode().is_blob()) {
            newest_first.push(entry.object_id());
        }
    }

    let mut seen = HashSet::new();
    let mut oldest_first: Vec<gix::ObjectId> = newest_first
        .into_iter()
        .rev()
        .filter(|id| seen.insert(*id))
        .collect();
    let surplus = oldest_first.len().saturating_sub(CANDIDATES);
    oldest_first.drain(..surplus);

    oldest_first
        .into_iter()
        .map(|id| {
            let object = repo.find_object(id).map_err(unreadable)?.detach();
            Ok((id, object.data))
        })
        .collect()
}

#[cfg(test)]
#[path = "merge_base_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "merge_base_vault_tests.rs"]
mod vault_tests;

#[cfg(test)]
#[path = "merge_base_git_tests.rs"]
mod git_tests;

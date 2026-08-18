//! One sync: bring down what changed, merge it, send ours back.
//!
//! Sending was written in story 6a, because gitoxide has no push. Fetching it
//! already does. So the only new decision here is what to do when both sides
//! moved — the one this feature has deferred since story 1, because until now
//! there was no common ancestor to decide it with.
//!
//! There is one now. A remote gives an **exact** base, so the rule that banned
//! three-way merging for a cloud daemon's copies does not apply: nothing is
//! being guessed. gitoxide does the merge, git's own algorithm and all its
//! awkward cases included, and it is told to resolve rather than to mark —
//! `<<<<<<<` in the middle of someone's notes is a format they never chose and
//! their editor will not explain.
//!
//! What it could not resolve is written beside the note as a conflict copy, in
//! the same shape a sync daemon leaves behind. That is not a shortcut: it is
//! the shape story 3 predicted, and it means the panel, the merge view, the
//! settle rules and the checkpoints all apply here without a line added to
//! them. See `plans/auto-sync/pending-the_round_trip-high-hard.md`.

#![allow(dead_code)]

use std::path::Path;
use std::sync::atomic::AtomicBool;

use gix::merge::tree::{FileFavor, TreatAsUnresolved, TreeFavor};
use gix::remote::Direction;

use crate::error::NativeError;

use super::conflict;
use super::push;
use super::snapshot::{self, HISTORY_REF as BRANCH};

/// Where a fetched branch is put.
///
/// Deliberately outside `refs/heads/`, so nothing can mistake the other
/// device's work for our own history.
const REMOTE_REF: &str = "refs/thinkbrain/remote";

/// The workspace setting naming where a vault syncs to.
const SETTING: &str = "sync.destination";

/// What one round trip did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Synced {
    /// Notes the other side's work changed in this vault.
    pub brought_down: usize,
    /// Notes that needed a person, left as copies beside their originals.
    pub asked_about: usize,
    /// Objects sent onward.
    pub sent: usize,
    pub landed: push::Landed,
}

fn failed(code: &'static str, message: &'static str, error: impl std::fmt::Display) -> NativeError {
    NativeError::with_details(code, message, error.to_string())
}

/// Where this vault syncs to, if anyone has said.
///
/// Read from disk each time. A sync is rare and slow next to a file read, and
/// the moment a stale answer would matter most is the moment someone has just
/// changed it.
pub fn destination(app_data_dir: &Path, root: &Path) -> Option<String> {
    let path = crate::commands::settings::workspace_settings_path(app_data_dir, root);
    let contents = crate::commands::settings::read_settings_file(&path).ok()?;
    let named = crate::commands::settings::parse_app_settings_record(contents.as_deref())
        .get(SETTING)?
        .as_str()?
        .trim()
        .to_string();
    (!named.is_empty()).then_some(named)
}

/// One round trip: fetch, merge, send.
pub fn once(repo: &gix::Repository, vault: &Path, destination: &str) -> Result<Synced, NativeError> {
    let theirs = fetch(repo, destination)?;
    let ours = snapshot::head_commit(repo)?;

    let (brought_down, asked_about) = match (ours, theirs) {
        // Nothing to join: either they have nothing to give, or we have
        // nothing of our own and can simply take theirs.
        (_, None) => (0, 0),
        (None, Some(theirs)) => (adopt(repo, vault, theirs)?, 0),
        (Some(ours), Some(theirs)) if ours == theirs => (0, 0),
        (Some(ours), Some(theirs)) => merge(repo, vault, ours, theirs)?,
    };

    let Some(tip) = snapshot::head_commit(repo)? else {
        // A vault nobody has typed in yet, syncing to a place nobody has
        // pushed to. Not a fault, and not something to write a commit about.
        return Ok(Synced {
            brought_down,
            asked_about,
            sent: 0,
            landed: push::Landed::Moved,
        });
    };
    let sent = push::send(repo, destination, BRANCH, tip)?;

    Ok(Synced {
        brought_down,
        asked_about,
        sent: sent.objects,
        landed: sent.landed,
    })
}

/// Brings the destination's branch down into a ref of ours.
///
/// `None` means the far side has nothing on that branch yet, which is what a
/// destination looks like before anyone has synced to it.
fn fetch(repo: &gix::Repository, destination: &str) -> Result<Option<gix::ObjectId>, NativeError> {
    let unreachable = |error: &dyn std::fmt::Display| {
        NativeError::with_details(
            "sync.remote_unreachable",
            "Could not reach the place these notes sync to.",
            error.to_string(),
        )
    };

    let brought = repo
        .remote_at(gix::bstr::BStr::new(destination))
        .map_err(|error| unreachable(&error))?
        .with_refspecs([format!("{BRANCH}:{REMOTE_REF}").as_str()], Direction::Fetch)
        .map_err(|error| unreachable(&error))?
        .with_fetch_tags(gix::remote::fetch::Tags::None)
        .connect(Direction::Fetch)
        .map_err(|error| unreachable(&error))?
        .prepare_fetch(gix::progress::Discard, Default::default())
        .map_err(|error| unreachable(&error))?
        .receive(gix::progress::Discard, &AtomicBool::default());

    match brought {
        Ok(_) => head_of(repo, REMOTE_REF),
        // The branch is simply not there: a destination nobody has synced to
        // yet. Nothing to bring down is not a failure to reach it.
        Err(gix::remote::fetch::Error::NoMapping { .. }) => Ok(None),
        Err(error) => Err(unreachable(&error)),
    }
}

fn head_of(repo: &gix::Repository, reference: &str) -> Result<Option<gix::ObjectId>, NativeError> {
    let unreadable =
        |error: &dyn std::fmt::Display| failed("sync.history_unreadable", "Could not read a sync marker.", error);
    repo.try_find_reference(reference)
        .map_err(|error| unreadable(&error))?
        .map(|mut found| found.peel_to_id().map(gix::Id::detach).map_err(|error| unreadable(&error)))
        .transpose()
}

/// Takes the other side's history wholesale, because this vault has none.
fn adopt(repo: &gix::Repository, vault: &Path, theirs: gix::ObjectId) -> Result<usize, NativeError> {
    let brought_down = apply(repo, vault, None, tree_of(repo, theirs)?)?;
    repo.reference(
        BRANCH,
        theirs,
        gix::refs::transaction::PreviousValue::Any,
        "brought down from another device",
    )
    .map_err(|error| failed("sync.commit_failed", "Could not record what arrived.", error))?;
    Ok(brought_down)
}

/// Joins the two histories, and says what changed and what could not be decided.
fn merge(
    repo: &gix::Repository,
    vault: &Path,
    ours: gix::ObjectId,
    theirs: gix::ObjectId,
) -> Result<(usize, usize), NativeError> {
    let cannot = |error: &dyn std::fmt::Display| {
        NativeError::with_details(
            "sync.merge_failed",
            "Could not combine this device's notes with the other one's.",
            error.to_string(),
        )
    };

    let options = repo
        .tree_merge_options()
        .map_err(|error| cannot(&error))?
        // Resolve, never mark. `Ours` is precise: their hunks still arrive
        // wherever they do not collide with ours, and only a genuine overlap
        // keeps our wording — which is then asked about as a copy.
        .with_file_favor(Some(FileFavor::Ours))
        .with_tree_favor(Some(TreeFavor::Ours));

    let mut outcome = repo
        .merge_commits(ours, theirs, Default::default(), options.into())
        .map_err(|error| cannot(&error))?;

    // Anything forced counts, because forcing is exactly what we asked for
    // above and exactly what a person still has to look at.
    let undecided: Vec<&gix::merge::tree::Conflict> = outcome
        .tree_merge
        .conflicts
        .iter()
        .filter(|conflict| conflict.is_unresolved(TreatAsUnresolved::forced_resolution()))
        .collect();

    let asked_about = leave_copies(repo, vault, &undecided)?;
    let merged = outcome
        .tree_merge
        .tree
        .write()
        .map_err(|error| cannot(&error))?
        .detach();

    let brought_down = apply(repo, vault, Some(tree_of(repo, ours)?), merged)?;
    snapshot::record_merge(repo, merged, ours, theirs, &describe(brought_down, asked_about))?;

    Ok((brought_down, asked_about))
}

fn describe(brought_down: usize, asked_about: usize) -> String {
    let notes = if brought_down == 1 { "note" } else { "notes" };
    match asked_about {
        0 => format!("Brought down {brought_down} {notes} from another device"),
        1 => format!("Brought down {brought_down} {notes} from another device — 1 to choose between"),
        many => format!("Brought down {brought_down} {notes} from another device — {many} to choose between"),
    }
}

/// Writes the other side's version of each undecided note beside our own.
///
/// A copy that cannot be written is not a copy that can be skipped: their
/// wording would be nowhere, and our own would look like the only thing anyone
/// wrote. So a failure here fails the sync.
fn leave_copies(
    repo: &gix::Repository,
    vault: &Path,
    undecided: &[&gix::merge::tree::Conflict],
) -> Result<usize, NativeError> {
    let mut left = 0;
    for conflict in undecided {
        let (_, theirs) = conflict.changes_in_resolution();
        let (mode, id) = theirs.entry_mode_and_id();
        if !mode.is_blob() {
            // A folder, or a note they deleted. Neither is a version of
            // anything, so there is nothing to put beside ours.
            continue;
        }
        let original = theirs.location().to_string();
        let beside = conflict::beside(&original, |path| vault.join(path).exists());
        let contents = repo
            .find_object(id)
            .map_err(|error| {
                failed(
                    "sync.history_unreadable",
                    "Could not read the other device's version of a note.",
                    error,
                )
            })?
            .data
            .clone();
        put(&vault.join(&beside), &contents)?;
        left += 1;
    }
    Ok(left)
}

/// Brings the vault to `after`, and answers with how many notes moved.
///
/// A tree diff rather than a checkout: this repository has no index and wants
/// none, and only the paths that changed should be touched — everything else
/// in the folder is the user's and none of our business.
fn apply(
    repo: &gix::Repository,
    vault: &Path,
    before: Option<gix::ObjectId>,
    after: gix::ObjectId,
) -> Result<usize, NativeError> {
    let unreadable = |error: &dyn std::fmt::Display| {
        NativeError::with_details(
            "sync.history_unreadable",
            "Could not read what arrived from the other device.",
            error.to_string(),
        )
    };

    let after = repo.find_tree(after).map_err(|error| unreadable(&error))?;
    let before = match before {
        Some(before) => repo.find_tree(before).map_err(|error| unreadable(&error))?,
        None => repo.empty_tree(),
    };

    let mut recorder = gix::diff::tree::Recorder::default();
    gix::diff::tree(
        gix::objs::TreeRefIter::from_bytes(&before.data, before.id.kind()),
        gix::objs::TreeRefIter::from_bytes(&after.data, after.id.kind()),
        &mut gix::diff::tree::State::default(),
        &repo.objects,
        &mut recorder,
    )
    .map_err(|error| unreadable(&error))?;

    use gix::diff::tree::recorder::Change;
    let mut moved = 0;
    for record in recorder.records {
        let (mode, path, contents) = match record {
            Change::Addition {
                entry_mode,
                oid,
                path,
                ..
            }
            | Change::Modification {
                entry_mode,
                oid,
                path,
                ..
            } => (entry_mode, path, Some(oid)),
            Change::Deletion {
                entry_mode, path, ..
            } => (entry_mode, path, None),
        };
        if !mode.is_blob() {
            continue;
        }
        let path = vault.join(path.to_string());
        match contents {
            Some(oid) => {
                let bytes = repo
                    .find_object(oid)
                    .map_err(|error| unreadable(&error))?
                    .data
                    .clone();
                put(&path, &bytes)?;
            }
            // Already gone is the state we wanted; anything else is a failure
            // worth hearing about.
            None => match std::fs::remove_file(&path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(failed(
                        "sync.note_write_failed",
                        "Could not remove a note the other device deleted.",
                        error,
                    ));
                }
            },
        }
        moved += 1;
    }

    Ok(moved)
}

fn put(path: &Path, bytes: &[u8]) -> Result<(), NativeError> {
    if let Some(folder) = path.parent() {
        std::fs::create_dir_all(folder).map_err(|error| {
            failed(
                "sync.note_write_failed",
                "Could not make room for a note that arrived.",
                error,
            )
        })?;
    }
    std::fs::write(path, bytes).map_err(|error| {
        failed(
            "sync.note_write_failed",
            "Could not write a note that arrived.",
            error,
        )
    })
}

fn tree_of(repo: &gix::Repository, commit: gix::ObjectId) -> Result<gix::ObjectId, NativeError> {
    Ok(repo
        .find_commit(commit)
        .map_err(|error| failed("sync.history_unreadable", "Could not read a recorded state.", error))?
        .tree_id()
        .map_err(|error| failed("sync.history_unreadable", "Could not read a recorded state.", error))?
        .detach())
}

#[cfg(test)]
#[path = "round_tests.rs"]
mod tests;

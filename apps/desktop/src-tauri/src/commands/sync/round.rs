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

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

use gix::merge::tree::{FileFavor, TreatAsUnresolved, TreeFavor};
use gix::remote::Direction;

use serde::Serialize;

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
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
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
    let (brought_down, _) = apply(
        repo,
        vault,
        snapshot::tree_of(repo, None)?,
        snapshot::tree_of(repo, Some(theirs))?,
    )?;
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

    // Two folders that each already held notes, pointed at one destination for
    // the first time, share no history at all. Refusing would leave someone
    // with two devices that can never be joined; an empty base keeps
    // everything on both sides and asks about the genuine clashes.
    let options = gix::merge::commit::Options::from(options).with_allow_missing_merge_base(true);
    let mut outcome = repo
        .merge_commits(ours, theirs, Default::default(), options)
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

    let (brought_down, kept_back) = apply(repo, vault, snapshot::tree_of(repo, Some(ours))?, merged)?;
    let asked_about = asked_about + kept_back;
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

/// Brings the vault to `after`: how many notes moved, and how many were left
/// beside rather than written over.
///
/// A tree diff rather than a checkout: this repository has no index and wants
/// none, and only the paths that changed should be touched — everything else in
/// the folder is the user's and none of our business.
fn apply(
    repo: &gix::Repository,
    vault: &Path,
    before: gix::ObjectId,
    after: gix::ObjectId,
) -> Result<(usize, usize), NativeError> {
    use gix::diff::tree::recorder::Change;

    // Every name is checked before anything is written, because the names come
    // from wherever this folder syncs to and `..` is one git's tree format
    // allows. A name that would lead out of the folder stops the whole sync: it
    // is either hostile or broken, and neither is something to half-apply.
    let mut arriving = Vec::new();
    for record in snapshot::changes_between(repo, &mut Default::default(), before, after)? {
        let (mode, path, blob, expected) = match record {
            Change::Addition { entry_mode, oid, path, .. } => (entry_mode, path, Some(oid), None),
            Change::Modification { entry_mode, oid, previous_oid, path, .. } => {
                (entry_mode, path, Some(oid), Some(previous_oid))
            }
            Change::Deletion { entry_mode, oid, path, .. } => (entry_mode, path, None, Some(oid)),
        };
        if !mode.is_blob() {
            continue;
        }
        arriving.push((within(vault, path.as_ref())?, path, blob, expected));
    }

    let (mut moved, mut kept_back) = (0, 0);
    for (path, relative, blob, expected) in arriving {
        // Never write over something we did not expect to find. A note someone
        // edited while this was running — or after a sync that was interrupted
        // before it could record what it had done — is theirs, and the other
        // side's version goes beside it rather than over it.
        if let Some(theirs) = unexpected(repo, &path, blob, expected)? {
            let beside = conflict::beside(&relative.to_string(), |name| vault.join(name).exists());
            put(&vault.join(&beside), &theirs)?;
            kept_back += 1;
            continue;
        }

        match blob {
            Some(blob) => put(&path, &contents(repo, blob)?)?,
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

    Ok((moved, kept_back))
}

/// The other side's bytes, when what is on disk is not what we were about to
/// replace — and `None` when writing is safe.
fn unexpected(
    repo: &gix::Repository,
    path: &Path,
    blob: Option<gix::ObjectId>,
    expected: Option<gix::ObjectId>,
) -> Result<Option<Vec<u8>>, NativeError> {
    let Ok(on_disk) = std::fs::read(path) else {
        // Nothing there to lose. A note already gone is also the state a
        // deletion wanted.
        return Ok(None);
    };
    let current = gix::objs::compute_hash(repo.object_hash(), gix::object::Kind::Blob, &on_disk)
        .map_err(|error| failed("sync.note_write_failed", "Could not read a note before replacing it.", error))?;

    if Some(current) == expected || Some(current) == blob {
        return Ok(None);
    }
    match blob {
        Some(blob) => contents(repo, blob).map(Some),
        // They deleted a note this device has since changed. Keeping it is the
        // safe direction, and there is nothing of theirs to put beside it.
        None => Ok(None),
    }
}

/// The path inside `vault` that a tree entry names, or a refusal.
fn within(vault: &Path, path: &gix::bstr::BStr) -> Result<PathBuf, NativeError> {
    let named = std::str::from_utf8(path).map_err(|_| {
        NativeError::new(
            "sync.note_name_unreadable",
            "A note arrived under a name this device cannot read.",
        )
    })?;
    Ok(vault.join(snapshot::vault_relative(vault, Path::new(named))?))
}

fn contents(repo: &gix::Repository, blob: gix::ObjectId) -> Result<Vec<u8>, NativeError> {
    Ok(repo
        .find_object(blob)
        .map_err(|error| {
            failed(
                "sync.history_unreadable",
                "Could not read a note that arrived.",
                error,
            )
        })?
        .data
        .clone())
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


/// Syncs one workspace, start to finish.
///
/// Everything slow happens on the workspace's lane, so a second window and a
/// second click queue rather than interleave — two rounds at once would both
/// merge onto the same tip and one of them would find the branch moved from
/// under it.
///
/// A refusal is worth exactly one more try: it means the destination moved
/// while we were merging, and going round again merges what arrived. Twice is
/// the bound — a third would be a loop shaped like a race someone else is
/// winning, and the answer to that is to say so, not to keep trying.
pub fn sync(
    engine: &super::engine::Engine,
    key: &str,
    root: &Path,
    destination: &str,
) -> Result<Synced, NativeError> {
    let lane = super::registry::lane(key);
    let _lane = lane.lock().unwrap_or_else(|error| error.into_inner());

    // Whatever is still sitting in the settle window belongs in this sync.
    engine.flush()?;

    let repo = engine.repository();
    let synced = once(&repo, root, destination)?;
    if !matches!(synced.landed, push::Landed::Refused { .. }) {
        return Ok(synced);
    }

    let again = once(&repo, root, destination)?;
    Ok(Synced {
        brought_down: synced.brought_down + again.brought_down,
        asked_about: synced.asked_about + again.asked_about,
        ..again
    })
}

/// Syncs this workspace once, now, because someone asked.
#[tauri::command]
pub fn sync_now(app: tauri::AppHandle, root_path: String) -> Result<Synced, NativeError> {
    use tauri::Manager as _;

    let root = crate::commands::workspace::resolve_workspace_root(&root_path)?;
    let key = root.to_string_lossy().to_string();
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        failed("sync.no_app_data", "Could not find where this app keeps its files.", error)
    })?;
    let destination = destination(&app_data_dir, &root).ok_or_else(|| {
        NativeError::new(
            "sync.no_destination",
            "This folder is not set up to sync anywhere yet.",
        )
    })?;
    let engine = super::registry::engine(&key).ok_or_else(|| {
        super::registry::failure(&key).unwrap_or_else(|| {
            NativeError::new(
                "sync.not_recording",
                "This folder's history is not being kept, so there is nothing to sync.",
            )
        })
    })?;

    let synced = sync(&engine, &key, &root, &destination)?;

    if synced.asked_about > 0 {
        engine.note_conflicts(super::settle::obvious(&engine, &root, conflict::scan(&root)));
        crate::commands::watcher::announce_conflicts(&app, &key);
    }
    crate::commands::watcher::announce_sync_status(&key);

    Ok(synced)
}

#[cfg(test)]
#[path = "round_tests.rs"]
mod tests;

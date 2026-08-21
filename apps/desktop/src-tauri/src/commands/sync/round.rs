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
//! them. See `plans/auto-sync/done-the_round_trip-high-hard.md`.

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use gix::merge::tree::{FileFavor, TreatAsUnresolved, TreeFavor};
use serde::Serialize;

use crate::error::NativeError;

use super::apply;
use super::conflict;
use super::engine::{StuckNote, SyncPhase};
use super::failed;
use super::network;
use super::network::bounded;
use super::push;
use super::snapshot::{self, HISTORY_REF as BRANCH};

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
    /// The conflict copies this round trip wrote beside their originals.
    ///
    /// Held back from the frontend (`serde(skip)`): the UI only needs the
    /// count, and the panel learns about the copies through the engine. Kept
    /// on the struct so `sync_now` can note them directly instead of re-walking
    /// the vault to rediscover what this sync just wrote.
    #[serde(skip)]
    pub conflict_copies: Vec<conflict::ConflictCopy>,
    /// Notes this round trip could not write. Held back from the frontend
    /// (`serde(skip)`): the engine surfaces them as needs-attention.
    #[serde(skip)]
    pub skipped: Vec<StuckNote>,
}

/// Where this vault syncs to, if anyone has said.
///
/// Read from disk each time. A sync is rare and slow next to a file read, and
/// the moment a stale answer would matter most is the moment someone has just
/// changed it.
pub fn destination(app_data_dir: &Path, root: &Path) -> Option<String> {
    let path = crate::commands::settings::workspace_settings_path(app_data_dir, root);
    // Distinguish "key absent" (a legitimate `None`) from "file present but
    // unreadable" (a loud, traceable failure). The old `.ok()?` collapsed I/O
    // and parse errors into `None`, misreporting a corrupt settings file as
    // "not set up to sync." We still return `None` so a bad file does not break
    // sync entirely, but the failure is now logged so it can be found.
    let contents = match crate::commands::settings::read_settings_file(&path) {
        Ok(contents) => contents,
        Err(error) => {
            eprintln!("[sync] settings unreadable: {error:?}");
            return None;
        }
    };
    let mut record = crate::commands::settings::parse_app_settings_record(contents.as_deref());
    let named = record.get(SETTING)?.as_str()?.trim().to_string();
    if named.is_empty() {
        return None;
    }
    let redacted = super::credentials::take_from_url(&named);
    if redacted != named {
        record.insert(
            SETTING.to_string(),
            serde_json::Value::String(redacted.clone()),
        );
        match crate::commands::settings::serialize_app_settings_record(record) {
            Ok(written) => {
                if let Err(error) =
                    crate::commands::workspace::write_file_atomically(&path, written)
                {
                    eprintln!("[sync] failed to redact secret from settings: {error:?}");
                }
            }
            Err(_) => {
                eprintln!("[sync] failed to serialize redacted settings, secret may remain on disk")
            }
        }
    }
    Some(redacted)
}

/// One round trip: fetch, merge, send.
#[cfg(test)]
pub fn once(
    repo: &gix::Repository,
    vault: &Path,
    destination: &str,
) -> Result<Synced, NativeError> {
    run_trip(repo, vault, destination, None, |_| {})
}

/// Fetch, merge, and send with an explicit profile and phase callback.
///
/// Import uses this rather than [`sync`] so it can hold the workspace lane
/// itself and not deadlock, and so Settings' "saving" step is skipped for an
/// empty new folder.
pub(super) fn run_trip(
    repo: &gix::Repository,
    vault: &Path,
    destination: &str,
    profile_id: Option<&str>,
    on_phase: impl FnMut(SyncPhase),
) -> Result<Synced, NativeError> {
    trip(
        repo,
        vault,
        destination,
        Arc::new(AtomicBool::new(false)),
        profile_id.map(str::to_owned),
        on_phase,
    )
}

fn trip(
    repo: &gix::Repository,
    vault: &Path,
    destination: &str,
    cancel: Arc<AtomicBool>,
    profile_id: Option<String>,
    mut on_phase: impl FnMut(SyncPhase),
) -> Result<Synced, NativeError> {
    on_phase(SyncPhase::Checking);
    let theirs = {
        let repo = repo.clone();
        let destination = destination.to_owned();
        let cancel = Arc::clone(&cancel);
        let profile = profile_id.clone();
        bounded(network::NETWORK, Arc::clone(&cancel), move || {
            super::credentials::with_profile(profile.as_deref(), || {
                network::fetch(&repo, &destination, &cancel)
            })
        })
    }?;
    let ours = snapshot::head_commit(repo)?;

    let (brought_down, asked_about, copies, mut skipped) = match (ours, theirs) {
        // Nothing to join: either they have nothing to give, or we have
        // nothing of our own and can simply take theirs.
        (_, None) => (0, 0, Vec::new(), Vec::new()),
        (None, Some(theirs)) => {
            on_phase(SyncPhase::Combining);
            let (brought_down, copies, skipped) = adopt(repo, vault, theirs)?;
            (brought_down, copies.len(), copies, skipped)
        }
        (Some(ours), Some(theirs)) if ours == theirs => (0, 0, Vec::new(), Vec::new()),
        (Some(ours), Some(theirs)) => {
            on_phase(SyncPhase::Combining);
            merge(repo, vault, ours, theirs)?
        }
    };
    skipped.extend(apply::skipped_unsupported(repo, vault)?);

    let Some(tip) = snapshot::head_commit(repo)? else {
        // A vault nobody has typed in yet, syncing to a place nobody has
        // pushed to. Not a fault, and not something to write a commit about.
        return Ok(Synced {
            brought_down,
            asked_about,
            sent: 0,
            landed: push::Landed::Moved,
            conflict_copies: copies,
            skipped,
        });
    };
    on_phase(SyncPhase::Sending);
    let sent = {
        let repo = repo.clone();
        let destination = destination.to_owned();
        let cancel = Arc::clone(&cancel);
        let profile = profile_id.clone();
        bounded(network::NETWORK, cancel, move || {
            super::credentials::with_profile(profile.as_deref(), || {
                push::send(&repo, &destination, BRANCH, tip)
            })
        })
    }?;

    Ok(Synced {
        brought_down,
        asked_about,
        sent: sent.objects,
        landed: sent.landed,
        conflict_copies: copies,
        skipped,
    })
}

/// Takes the other side's history wholesale, because this vault has none.
fn adopt(
    repo: &gix::Repository,
    vault: &Path,
    theirs: gix::ObjectId,
) -> Result<(usize, Vec<conflict::ConflictCopy>, Vec<StuckNote>), NativeError> {
    let (brought_down, _, copies, skipped) = apply::apply(
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
    .map_err(|error| {
        failed(
            "sync.commit_failed",
            "Could not record what arrived.",
            error,
        )
    })?;
    Ok((brought_down, copies, skipped))
}

fn cannot(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.merge_failed",
        "Could not combine this device's notes with the other one's.",
        error,
    )
}

/// Joins the two histories, and says what changed and what could not be decided.
fn merge(
    repo: &gix::Repository,
    vault: &Path,
    ours: gix::ObjectId,
    theirs: gix::ObjectId,
) -> Result<(usize, usize, Vec<conflict::ConflictCopy>, Vec<StuckNote>), NativeError> {
    let options = repo
        .tree_merge_options()
        .map_err(cannot)?
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
        .map_err(cannot)?;

    // Anything forced counts, because forcing is exactly what we asked for
    // above and exactly what a person still has to look at.
    let undecided: Vec<&gix::merge::tree::Conflict> = outcome
        .tree_merge
        .conflicts
        .iter()
        .filter(|conflict| conflict.is_unresolved(TreatAsUnresolved::forced_resolution()))
        .collect();

    let (mut copies, mut skipped) = apply::leave_copies(repo, vault, &undecided)?;
    let asked_about = copies.len();
    let merged = outcome.tree_merge.tree.write().map_err(cannot)?.detach();

    let (brought_down, kept_back, kept_copies, more) =
        apply::apply(repo, vault, snapshot::tree_of(repo, Some(ours))?, merged)?;
    copies.extend(kept_copies);
    skipped.extend(more);
    let asked_about = asked_about + kept_back;
    snapshot::record_merge(
        repo,
        merged,
        ours,
        theirs,
        &describe(brought_down, asked_about),
    )?;

    Ok((brought_down, asked_about, copies, skipped))
}

fn describe(brought_down: usize, asked_about: usize) -> String {
    let notes = if brought_down == 1 { "note" } else { "notes" };
    match asked_about {
        0 => format!("Brought down {brought_down} {notes} from another device"),
        1 => {
            format!("Brought down {brought_down} {notes} from another device — 1 to choose between")
        }
        many => format!(
            "Brought down {brought_down} {notes} from another device — {many} to choose between"
        ),
    }
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
    profile_id: Option<&str>,
) -> Result<Synced, NativeError> {
    let lane = super::registry::lane(key);
    let _lane = lane.lock().unwrap_or_else(|error| {
        eprintln!("[sync] sync lane mutex was poisoned, recovering: {error}");
        error.into_inner()
    });

    engine.set_syncing(true);
    crate::commands::watcher::announce_sync_status(key);
    struct Clear<'a>(&'a super::engine::Engine, &'a str);
    impl Drop for Clear<'_> {
        fn drop(&mut self) {
            self.0.set_syncing(false);
            crate::commands::watcher::announce_sync_status(self.1);
        }
    }
    let _clear = Clear(engine, key);
    // Count an attempted round, not only a successful one. Otherwise a bad
    // link or missing sign-in starts a new automatic attempt every sweep tick.
    engine.mark_synced();
    let profile = profile_id.map(str::to_owned);
    let outcome = (|| {
        // Whatever is still sitting in the settle window belongs in this sync.
        report_phase(engine, key, SyncPhase::Saving);
        engine.flush()?;
        apply::retry_stuck(engine, root)?;

        let repo = engine.repository();
        let cancel = Arc::new(AtomicBool::new(false));
        let synced = trip(
            &repo,
            root,
            destination,
            Arc::clone(&cancel),
            profile.clone(),
            |phase| report_phase(engine, key, phase),
        )?;
        engine.forget_unsupported();
        engine.note_stuck(synced.skipped.clone());
        if !matches!(synced.landed, push::Landed::Refused { .. }) {
            return Ok(synced);
        }

        let again = trip(&repo, root, destination, cancel, profile.clone(), |phase| {
            report_phase(engine, key, phase)
        })?;
        engine.forget_unsupported();
        engine.note_stuck(again.skipped.clone());

        // Fold both trips into one report. `..again` keeps `sent` and `landed` from
        // the second trip — the first trip's push was refused, so its counts are
        // not part of what landed this round, and `synced.sent`/`synced.landed` are
        // dropped here on purpose.
        let mut conflict_copies = synced.conflict_copies;
        conflict_copies.extend(again.conflict_copies);
        let mut skipped = synced.skipped;
        skipped.extend(again.skipped);
        Ok(Synced {
            brought_down: synced.brought_down + again.brought_down,
            asked_about: synced.asked_about + again.asked_about,
            conflict_copies,
            skipped,
            ..again
        })
    })();
    engine.set_sync_problem(outcome.as_ref().err().cloned());
    if outcome.is_ok() {
        if let Err(error) = engine.maintain(false) {
            eprintln!("[sync] history maintenance after a round trip failed: {error:?}");
        }
    }
    outcome
}

fn report_phase(engine: &super::engine::Engine, key: &str, phase: SyncPhase) {
    engine.set_phase(Some(phase));
    crate::commands::watcher::announce_sync_status(key);
}

/// Records and announces anything a completed round left for the UI.
///
/// Manual sync and credential-save sync both use this; otherwise the latter
/// can write conflict copies without opening the same merge workflow.
pub(super) fn finish(
    app: &tauri::AppHandle,
    engine: &super::engine::Engine,
    key: &str,
    root: &Path,
    mut synced: Synced,
) -> Synced {
    let copies = std::mem::take(&mut synced.conflict_copies);
    if !copies.is_empty() {
        let new = engine.note_conflicts(super::settle::obvious(engine, root, copies));
        if new {
            crate::commands::watcher::announce_conflicts(app, key);
        }
    }
    crate::commands::watcher::announce_sync_status(key);
    synced
}

/// Syncs this workspace once, now, because someone asked.
#[tauri::command]
pub fn sync_now(app: tauri::AppHandle, root_path: String) -> Result<Synced, NativeError> {
    use tauri::Manager as _;

    let root = crate::commands::workspace::resolve_workspace_root(&root_path)?;
    let key = root.to_string_lossy().to_string();
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        failed(
            "sync.no_app_data",
            "Could not find where this app keeps its files.",
            error,
        )
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

    let profile = super::sign_in::selected_profile_id_for(&root);
    let synced = sync(&engine, &key, &root, &destination, profile.as_deref())?;
    Ok(finish(&app, &engine, &key, &root, synced))
}

#[cfg(test)]
#[path = "round_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "round_security_tests.rs"]
mod security_tests;

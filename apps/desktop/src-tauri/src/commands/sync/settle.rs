//! The conflicts that are not questions.
//!
//! A sync daemon writes a conflict copy whenever two devices disagree about a
//! file, which is not the same as two people disagreeing about a note. Metadata
//! races, clock skew and a device that was simply behind all produce copies
//! that carry nothing to decide, and asking about those teaches someone that
//! the list is noise.
//!
//! Deliberately *not* a merge. Git settles a hunk silently when only one side
//! changed it **relative to the common ancestor**, and a cloud daemon hands us
//! two files and no ancestor. Given nothing on our side and a paragraph on
//! theirs, "they added it" and "we deleted it" have the same shape, and picking
//! between them by guessing a base is how someone loses what they wrote. So
//! this settles only what is provable without a base:
//!
//! - the copy is byte-identical to the note, so there is nothing in it; or
//! - the copy is a state the note has already been through, recorded in its own
//!   history, so ours holds everything theirs did.
//!
//! Everything else is a real question and is asked.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::NativeError;

use super::conflict::ConflictCopy;
use super::engine::Engine;
use super::history;
use super::snapshot::Reason;

/// The setting's key, and the default it has to agree with.
///
/// Repeated from `packages/core/src/settings/modules/sync.ts` rather than
/// derived, because this side answers the question before any window is
/// listening. Changing one means changing the other.
const SETTING: &str = "sync.settleAutomatically";
const SETTLE_BY_DEFAULT: bool = true;

/// Where the app keeps its settings.
///
/// Its own lock rather than the engine registry's. Settling happens while a
/// workspace is being attached, and a registry that had to be unlocked to read
/// a preference would make that a deadlock rather than a slow path.
static SETTINGS_HOME: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Remembers where to look for the setting, for the paths that have no window.
pub fn remember_settings_home(app_data_dir: &Path) {
    let mut home = SETTINGS_HOME.lock().unwrap_or_else(|error| error.into_inner());
    home.get_or_insert_with(|| app_data_dir.to_path_buf());
}

/// Whether the user has asked for the obvious ones to be settled.
///
/// Read from disk each time rather than cached, and cheap enough because the
/// only caller has already found a conflict to settle — which is rare, and the
/// moment at which a stale answer would be most annoying.
fn enabled() -> bool {
    let home = {
        let home = SETTINGS_HOME.lock().unwrap_or_else(|error| error.into_inner());
        home.clone()
    };
    enabled_in(home.as_deref())
}

/// The same answer, read from a settings directory named outright.
///
/// Split from [`enabled`] so both answers can be tested against a real
/// settings file, rather than against a location the whole process shares.
/// Anything unreadable or unparseable falls back to the default: a preference
/// nobody can read is not an instruction to behave differently.
fn enabled_in(app_data_dir: Option<&Path>) -> bool {
    let Some(app_data_dir) = app_data_dir else {
        return SETTLE_BY_DEFAULT;
    };
    let path = crate::commands::settings::app_settings_path(app_data_dir);
    let Ok(contents) = crate::commands::settings::read_settings_file(&path) else {
        return SETTLE_BY_DEFAULT;
    };
    crate::commands::settings::parse_app_settings_record(contents.as_deref())
        .get(SETTING)
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(SETTLE_BY_DEFAULT)
}

/// Settles the conflicts that carry no decision, returning the rest.
///
/// A copy that cannot be read, or a checkpoint that cannot be taken, leaves the
/// conflict exactly where it was — being unable to settle something quietly is
/// a reason to ask, never a reason to drop it.
pub fn obvious(engine: &Engine, root: &Path, found: Vec<ConflictCopy>) -> Vec<ConflictCopy> {
    settle_when(enabled(), engine, root, found)
}

/// The same, told what the setting says rather than reading it.
fn settle_when(
    enabled: bool,
    engine: &Engine,
    root: &Path,
    found: Vec<ConflictCopy>,
) -> Vec<ConflictCopy> {
    if !enabled || found.is_empty() {
        return found;
    }
    let repo = engine.repository();
    found
        .into_iter()
        .filter(|copy| !settle(engine, &repo, root, copy).unwrap_or(false))
        .collect()
}

/// Settles one conflict if it is settle-able, reporting whether it was.
fn settle(
    engine: &Engine,
    repo: &gix::Repository,
    root: &Path,
    pairing: &ConflictCopy,
) -> Result<bool, NativeError> {
    let note = root.join(&pairing.original);
    let copy = root.join(&pairing.copy);

    let ours = std::fs::read(&note).map_err(read_failed)?;
    let theirs = std::fs::read(&copy).map_err(read_failed)?;

    // Cheapest first, and the one that holds even for a note nothing has
    // recorded yet — a vault opened seconds ago, or a note still settling.
    if ours != theirs {
        let theirs = blob_of(&theirs)?;
        if !history::has_recorded(repo, Path::new(&pairing.original), theirs)? {
            return Ok(false);
        }
    }

    // Checkpointed even though both rules are recoverable by construction: the
    // invariant is that nothing is written without a restore point, and an
    // invariant with an exception is a thing people have to remember.
    engine.checkpoint(
        &[
            PathBuf::from(&pairing.original),
            PathBuf::from(&pairing.copy),
        ],
        Reason::DuplicateDiscarded,
    )?;
    std::fs::remove_file(&copy).map_err(read_failed)?;
    Ok(true)
}

/// The id git would store these bytes under, which is also the only question
/// worth asking about whether two files are the same file.
fn blob_of(bytes: &[u8]) -> Result<gix::ObjectId, NativeError> {
    gix::objs::compute_hash(gix::hash::Kind::Sha1, gix::object::Kind::Blob, bytes).map_err(|error| {
        NativeError::with_details(
            "sync.version_read_failed",
            "Could not compare the two versions.",
            error.to_string(),
        )
    })
}

fn read_failed(error: std::io::Error) -> NativeError {
    NativeError::with_details(
        "sync.version_read_failed",
        "Could not read one of the two versions.",
        error.to_string(),
    )
}

#[cfg(test)]
#[path = "settle_tests.rs"]
mod tests;

//! Presenting a conflict, and carrying out what the user decides about it.
//!
//! Two versions of a note exist because a sync daemon refused to choose between
//! them. This module reads both, hands [`merge`] the bytes, and writes back
//! whatever comes of the choice — but only after a checkpoint holds both sides,
//! and only if neither has moved since the chunks were built.
//!
//! Deliberately *not* echo-suppressed. Every other write the app makes claims
//! its own echo so the indexes ignore it, because the in-app path has already
//! updated them. Here the opposite is true: the note's content changed under an
//! editor that is probably open on it, and the copy beside it disappeared from
//! the file list. Letting the watcher report both is what refreshes every window
//! showing this vault, using the path that already exists for outside edits.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::commands::workspace::{
    entry_metadata, resolve_workspace_entry_path, resolve_workspace_root,
    WORKSPACE_ENTRY_MUTATION_LOCK,
};
use crate::NativeError;

use super::conflict::{self, ConflictCopy};
use super::engine::Engine;
use super::merge::{self, Chunk, Kind};

/// What we call the version already in the vault.
const OURS_LABEL: &str = "This computer";

/// One side of a conflict, as the panel shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    /// Vault-relative, forward slashes.
    pub path: String,
    /// Whose version this is, in the user's terms: "This computer", "Syncthing".
    pub label: String,
    pub byte_size: u64,
    /// Milliseconds since the epoch, as the rest of the app reports mtimes.
    pub changed_at: Option<u64>,
    /// What this side was on disk when the chunks were built.
    ///
    /// Sent back with the resolution so a write cannot land on content nobody
    /// looked at. Content-addressed rather than a timestamp: a cloud daemon can
    /// deliver a new version inside the same second the old one was read.
    pub fingerprint: String,
}

/// A conflict, without the line-by-line comparison.
///
/// What a triage card needs: both names, both sizes and dates, who made the
/// copy, and whether a review is even possible. Both fingerprints are here too,
/// so a card offering "keep this one" can carry out that choice without opening
/// anything first.
///
/// `theirs.path` is the handle for [`read_conflict`] and [`resolve_conflict`]:
/// a conflict is named by the copy, and the rest is derived from it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictSummary {
    pub kind: Kind,
    pub ours: Version,
    pub theirs: Version,
}

/// A conflict, in the only form the merge view ever sees.
///
/// There is no mention of where the chunks came from. A two-way comparison of a
/// daemon's copy and a three-way merge against a real base produce the same
/// shape, so the panel that renders this does not learn which happened.
///
/// Flattened over [`ConflictSummary`], so a card and an opened comparison are
/// one shape to the frontend, with the chunks the only difference between them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictView {
    #[serde(flatten)]
    pub summary: ConflictSummary,
    /// Empty when `kind` is binary: there is nothing to compare line by line,
    /// and the choice is between whole files.
    pub chunks: Vec<Chunk>,
}

/// What the user decided.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Resolution {
    /// Keep what is already in the vault and drop the daemon's copy.
    KeepOurs,
    /// Replace the note with the daemon's copy.
    KeepTheirs,
    /// Keep both, renaming the copy after the provider that made it. The escape
    /// hatch for "I cannot tell, and I am not deciding under pressure".
    KeepBoth,
    /// Chunk by chunk, as assembled by the panel.
    Merged { contents: String },
}

/// Where things ended up, so the window that asked can say so.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolved {
    /// The note that now holds the resolution.
    pub note: String,
    /// Where the other version was kept, if it was.
    pub kept_as: Option<String>,
    /// The restore point taken before anything was written.
    pub checkpoint: String,
}

/// Every conflict this workspace is waiting on someone to decide.
///
/// An unmanaged vault has no engine and so no conflicts to report, which is an
/// empty list rather than an error: the panel showing nothing is the honest
/// rendering of "Auto Sync is not looking after this folder".
///
/// A conflict whose files have gone since it was noticed is left out rather
/// than failing the whole list — one unreadable pair must not hide the rest.
#[tauri::command]
pub fn list_conflicts(root_path: String) -> Result<Vec<ConflictSummary>, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let Some(engine) = super::registry::engine(&root.to_string_lossy()) else {
        return Ok(Vec::new());
    };

    Ok(engine
        .conflicts()
        .iter()
        .filter_map(|copy| summarise(&root, &copy.copy).ok())
        .collect())
}

#[tauri::command]
pub fn read_conflict(
    root_path: String,
    copy_path: String,
    buffer: Option<String>,
) -> Result<ConflictView, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    view(&root, &copy_path, buffer.as_deref())
}

#[tauri::command]
pub fn resolve_conflict(
    app: tauri::AppHandle,
    root_path: String,
    copy_path: String,
    resolution: Resolution,
    expected_ours: String,
    expected_theirs: String,
) -> Result<Resolved, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let key = root.to_string_lossy().to_string();
    // Without an engine there is no checkpoint, and without a checkpoint this
    // write would be the one thing Auto Sync promises never to be: a change to
    // the user's notes that cannot be undone.
    let engine = super::registry::engine(&key).ok_or_else(|| {
        NativeError::new(
            "sync.not_recorded",
            "Auto Sync is not keeping history for this workspace, so a conflict cannot be resolved here.",
        )
    })?;

    let resolved = resolve(&engine, &root, &copy_path, &resolution, &expected_ours, &expected_theirs)?;
    // One fewer thing waiting on the user, in every window showing this vault.
    // The watcher will not say so on its own: it reports files, and the copy
    // going away is precisely the event that must *not* re-raise a conflict.
    crate::commands::watcher::announce_conflicts(&app, &key);
    Ok(resolved)
}

/// Builds the comparison for the conflict copy at `copy_path`.
///
/// `buffer` is the text of an editor open on the note with unsaved changes. It
/// stands in for the file on disk, because "this computer's version" is what
/// the user is looking at — resolving against the last save would quietly throw
/// away everything typed since. The fingerprint still comes from disk: it
/// exists to notice someone *else* writing, and the buffer is not someone else.
pub fn view(root: &Path, copy_path: &str, buffer: Option<&str>) -> Result<ConflictView, NativeError> {
    let sides = Sides::load(root, copy_path, buffer)?;
    let (kind, chunks) = merge::compare(sides.shown(), &sides.theirs.bytes);

    Ok(ConflictView {
        summary: sides.summarise(root, kind)?,
        chunks,
    })
}

/// The conflict at `copy_path` without comparing the two versions.
///
/// Deliberately does not run the diff: the triage list asks this of every
/// outstanding conflict at once, and a card shows names, sizes and dates.
pub fn summarise(root: &Path, copy_path: &str) -> Result<ConflictSummary, NativeError> {
    let sides = Sides::load(root, copy_path, None)?;
    let kind = merge::kind_of(sides.shown(), &sides.theirs.bytes);
    sides.summarise(root, kind)
}

/// Carries out `resolution`, checkpointing both sides first.
///
/// The order is the whole point. Nothing is written until a commit holds the
/// content of both files, so every outcome — including the one the user
/// regrets — is a restore away. Taking the engine as an argument rather than
/// looking it up is what makes that order testable.
pub fn resolve(
    engine: &Engine,
    root: &Path,
    copy_path: &str,
    resolution: &Resolution,
    expected_ours: &str,
    expected_theirs: &str,
) -> Result<Resolved, NativeError> {
    // Held across the read, the check and every write below, and it is the same
    // lock the ordinary note writes take — so a save landing in the middle of a
    // resolution is not a race this has to reason about.
    let _mutation_lock = WORKSPACE_ENTRY_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    // No buffer: the write checks and records what is on disk. An editor's
    // unsaved text belongs in the merged contents the panel sends, not here.
    let Sides { pairing, ours, theirs, .. } = Sides::load(root, copy_path, None)?;
    if fingerprint(&ours.bytes) != expected_ours || fingerprint(&theirs.bytes) != expected_theirs {
        return Err(NativeError::new(
            "sync.conflict_moved",
            "One of these versions changed while you were looking at it. Nothing was written.",
        ));
    }
    if matches!(resolution, Resolution::Merged { .. })
        && merge::kind_of(&ours.bytes, &theirs.bytes) == Kind::Binary
    {
        return Err(NativeError::new(
            "sync.not_mergeable",
            "This file cannot be merged line by line; keep one version or both.",
        ));
    }

    let checkpoint = engine.checkpoint(
        &[
            PathBuf::from(&pairing.original),
            PathBuf::from(&pairing.copy),
        ],
        super::snapshot::Reason::ConflictResolved,
    )?;

    let kept_as = match resolution {
        Resolution::KeepOurs => {
            discard(&theirs.path)?;
            None
        }
        Resolution::KeepTheirs => {
            put(&ours.path, &theirs.bytes)?;
            discard(&theirs.path)?;
            None
        }
        Resolution::Merged { contents } => {
            put(&ours.path, contents.as_bytes())?;
            discard(&theirs.path)?;
            None
        }
        Resolution::KeepBoth => Some(keep_both(root, &pairing)?),
    };

    // The conflict is answered whichever way it went, and after a rename the
    // copy no longer looks like one — so nothing would clear it later.
    engine.forget_conflict(&pairing.copy);

    Ok(Resolved {
        note: pairing.original,
        kept_as,
        checkpoint: checkpoint.to_string(),
    })
}

/// The conflict `copy_path` is one half of.
///
/// Derived here rather than taken from the caller: the original's name and the
/// provider's are both consequences of the copy's name, and a frontend that
/// could name the other side could aim this at any file in the vault.
fn pairing(root: &Path, copy_path: &str) -> Result<ConflictCopy, NativeError> {
    // Through the workspace resolver first, so a path that climbs out of the
    // vault is refused before anything reads it.
    let absolute = resolve_workspace_entry_path(root, copy_path)?;
    let relative = conflict::relative_str(absolute.strip_prefix(root).unwrap_or(&absolute));

    conflict::pair(&relative, |original| root.join(original).is_file()).ok_or_else(|| {
        NativeError::new(
            "sync.not_a_conflict",
            "That file is not a conflict copy of a note in this workspace.",
        )
    })
}

struct Loaded {
    path: PathBuf,
    bytes: Vec<u8>,
}

fn load(root: &Path, relative: &str) -> Result<Loaded, NativeError> {
    let path = resolve_workspace_entry_path(root, relative)?;
    let bytes = std::fs::read(&path).map_err(|error| {
        NativeError::with_details("sync.version_read_failed", "Could not read one of the two versions.", error)
    })?;
    Ok(Loaded { path, bytes })
}

/// Both versions of one conflict, read and ready to be compared or written.
///
/// Every entry point needs exactly this much — the pairing, both files, and
/// whatever should stand in for our side — so they all start here.
struct Sides {
    pairing: ConflictCopy,
    ours: Loaded,
    theirs: Loaded,
    /// An open editor's unsaved text, when there is one.
    buffer: Option<Vec<u8>>,
}

impl Sides {
    fn load(root: &Path, copy_path: &str, buffer: Option<&str>) -> Result<Self, NativeError> {
        let pairing = pairing(root, copy_path)?;
        Ok(Self {
            ours: load(root, &pairing.original)?,
            theirs: load(root, &pairing.copy)?,
            buffer: buffer.map(|text| text.as_bytes().to_vec()),
            pairing,
        })
    }

    /// Our side as the user sees it: the editor buffer if one was sent, and
    /// what is on disk otherwise.
    fn shown(&self) -> &[u8] {
        self.buffer.as_deref().unwrap_or(&self.ours.bytes)
    }

    fn summarise(&self, root: &Path, kind: Kind) -> Result<ConflictSummary, NativeError> {
        Ok(ConflictSummary {
            kind,
            ours: version(root, &self.ours, OURS_LABEL.to_string(), self.shown())?,
            theirs: version(root, &self.theirs, self.pairing.provider.to_string(), &self.theirs.bytes)?,
        })
    }
}

fn version(root: &Path, loaded: &Loaded, label: String, shown: &[u8]) -> Result<Version, NativeError> {
    let metadata = entry_metadata(root, &loaded.path)?;
    Ok(Version {
        path: metadata.relative_path,
        label,
        // What the user is looking at, which is the buffer when there is one.
        byte_size: shown.len() as u64,
        changed_at: metadata.updated_at,
        fingerprint: fingerprint(&loaded.bytes),
    })
}

/// A stable name for exactly these bytes.
///
/// The git blob id, because the repository is already here and computing it
/// costs one hash of content we have just read anyway.
fn fingerprint(bytes: &[u8]) -> String {
    gix::objs::compute_hash(gix::hash::Kind::Sha1, gix::object::Kind::Blob, bytes)
        .map(|id| id.to_string())
        // A hasher that will not hash has nothing useful to say, and answering
        // with a value that can never match is the safe direction: it refuses
        // the write rather than allowing an unchecked one.
        .unwrap_or_default()
}

fn put(path: &Path, bytes: &[u8]) -> Result<(), NativeError> {
    std::fs::write(path, bytes).map_err(|error| {
        NativeError::with_details("sync.resolution_write_failed", "Could not write the resolved note.", error)
    })
}

fn discard(path: &Path) -> Result<(), NativeError> {
    std::fs::remove_file(path).map_err(|error| {
        NativeError::with_details(
            "sync.conflict_cleanup_failed",
            "The note was resolved, but the extra copy could not be removed.",
            error,
        )
    })
}

/// Renames the copy after the provider that made it, returning the new path.
///
/// `note.sync-conflict-….md` becomes `note (Syncthing).md` — a name that says
/// where it came from, and no longer matches any pattern in the table, so the
/// same conflict is not offered again tomorrow.
fn keep_both(root: &Path, pairing: &ConflictCopy) -> Result<String, NativeError> {
    let (stem, extension) = conflict::split_extension(&pairing.original);

    for attempt in 1.. {
        let suffix = if attempt == 1 {
            pairing.provider.to_string()
        } else {
            format!("{} {attempt}", pairing.provider)
        };
        let candidate = format!("{stem} ({suffix}){extension}");
        let target = resolve_workspace_entry_path(root, &candidate)?;
        if target.exists() {
            continue;
        }
        std::fs::rename(root.join(&pairing.copy), &target).map_err(|error| {
            NativeError::with_details(
                "sync.conflict_cleanup_failed",
                "Both versions were kept, but the copy could not be renamed.",
                error,
            )
        })?;
        return Ok(candidate);
    }
    unreachable!("the loop returns or keeps counting")
}

#[cfg(test)]
mod tests {
    use super::super::bootstrap::bootstrap;
    use super::*;
    use crate::tests::make_temp_test_dir;
    use std::fs;

    const COPY: &str = "note.sync-conflict-20260816-093100-K3SDFHG.md";

    struct Fixture {
        vault: PathBuf,
        engine: Engine,
    }

    impl Fixture {
        fn view(&self) -> ConflictView {
            view(&self.vault, COPY, None).expect("the conflict is readable")
        }

        /// Resolves with the fingerprints the panel would have been handed.
        fn resolve(&self, resolution: Resolution) -> Result<Resolved, NativeError> {
            self.resolve_as_seen(&self.view(), resolution)
        }

        /// Resolves against a view taken earlier, which is how a stale one
        /// reaches the write.
        fn resolve_as_seen(
            &self,
            seen: &ConflictView,
            resolution: Resolution,
        ) -> Result<Resolved, NativeError> {
            resolve(
                &self.engine,
                &self.vault,
                COPY,
                &resolution,
                &seen.summary.ours.fingerprint,
                &seen.summary.theirs.fingerprint,
            )
        }

        fn read(&self, relative: &str) -> String {
            fs::read_to_string(self.vault.join(relative)).expect("the file is readable")
        }

        fn exists(&self, relative: &str) -> bool {
            self.vault.join(relative).exists()
        }
    }

    /// A vault holding one note and one conflict copy of it.
    fn fixture(name: &str, ours: &[u8], theirs: &[u8]) -> Fixture {
        let app_data = make_temp_test_dir(&format!("{name}-appdata"), "sync", true);
        let vault = make_temp_test_dir(&format!("{name}-vault"), "sync", true);
        fs::write(vault.join("note.md"), ours).expect("the note is written");
        fs::write(vault.join(COPY), theirs).expect("the copy is written");

        let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");
        Fixture {
            vault,
            engine: Engine::new(workspace.repo, workspace.has_own_git),
        }
    }

    fn text_fixture(name: &str) -> Fixture {
        fixture(name, b"# Note\nmine\nend\n", b"# Note\ntheirs\nend\n")
    }

    #[test]
    fn a_conflict_is_presented_as_the_two_versions_and_their_chunks() {
        let f = text_fixture("resolve-view");

        let seen = f.view();

        assert_eq!(seen.summary.kind, Kind::Text);
        assert_eq!(seen.summary.ours.path, "note.md");
        assert_eq!(seen.summary.ours.label, "This computer");
        assert_eq!(seen.summary.theirs.path, COPY);
        assert_eq!(seen.summary.theirs.label, "Syncthing");
        assert_eq!(
            seen.chunks,
            [
                Chunk::Common { text: "# Note\n".into() },
                Chunk::Choice { ours: "mine\n".into(), theirs: "theirs\n".into() },
                Chunk::Common { text: "end\n".into() },
            ]
        );
    }

    /// A file that is not half of a pair is not something to offer to resolve,
    /// and a path that climbs out of the vault is not something to read at all.
    ///
    /// The codes are asserted, not just the failure. A copy whose original is
    /// gone is a file someone named that way; saying so is the difference
    /// between "this is not a conflict" and a read error naming a note that has
    /// not existed for a week.
    #[test]
    fn only_a_real_conflict_copy_can_be_opened() {
        let f = text_fixture("resolve-not-a-conflict");
        // A real file in a conflict's shape whose original is not there.
        fs::write(
            f.vault.join("orphan.sync-conflict-20260816-093100-K3SDFHG.md"),
            "left behind",
        )
        .expect("the orphan is written");

        for (path, code) in [
            ("note.md", "sync.not_a_conflict"),
            ("orphan.sync-conflict-20260816-093100-K3SDFHG.md", "sync.not_a_conflict"),
            ("../outside.md", "workspace.invalid_path"),
        ] {
            let refused = view(&f.vault, path, None)
                .expect_err(&format!("{path} was accepted as a conflict"));
            assert_eq!(refused.code, code, "{path} was refused for the wrong reason");
        }
    }

    /// A triage card gets both versions and no comparison — it shows names,
    /// sizes and dates, and the list asks this of every conflict at once.
    ///
    /// The fingerprints have to match the opened view's, because a card offering
    /// "keep this one" resolves straight from them without opening anything.
    #[test]
    fn a_card_gets_both_versions_without_paying_for_the_chunks() {
        let f = text_fixture("resolve-summary");

        let card = summarise(&f.vault, COPY).expect("the conflict summarises");

        assert_eq!(card.kind, Kind::Text);
        assert_eq!(card.ours.path, "note.md");
        assert_eq!(card.ours.byte_size, "# Note\nmine\nend\n".len() as u64);
        assert_eq!(card.theirs.label, "Syncthing");
        assert_eq!(card, f.view().summary, "a card and an opened conflict disagree");
    }

    /// The version the user is looking at is the one in their editor, not the
    /// last one saved. Resolving against stale disk content would silently
    /// throw away everything typed since.
    #[test]
    fn an_unsaved_editor_buffer_stands_in_for_this_computers_version() {
        let f = text_fixture("resolve-buffer");

        let seen = view(&f.vault, COPY, Some("# Note\nstill typing\nend\n"))
            .expect("the conflict is readable");

        assert_eq!(
            seen.chunks,
            [
                Chunk::Common { text: "# Note\n".into() },
                Chunk::Choice { ours: "still typing\n".into(), theirs: "theirs\n".into() },
                Chunk::Common { text: "end\n".into() },
            ]
        );
    }

    /// The buffer is this app's own unsaved work, not another writer's — so it
    /// must not become the thing the write checks against, or every resolution
    /// with unsaved changes would refuse itself.
    #[test]
    fn the_fingerprint_follows_the_disk_even_when_a_buffer_is_shown() {
        let f = text_fixture("resolve-buffer-fingerprint");

        let with_buffer = view(&f.vault, COPY, Some("# Note\nstill typing\nend\n"))
            .expect("the conflict is readable");

        assert_eq!(with_buffer.summary.ours.fingerprint, f.view().summary.ours.fingerprint);
    }

    #[test]
    fn keeping_ours_leaves_the_note_alone_and_removes_the_copy() {
        let f = text_fixture("resolve-keep-ours");

        let done = f.resolve(Resolution::KeepOurs).expect("the resolution succeeds");

        assert_eq!(f.read("note.md"), "# Note\nmine\nend\n");
        assert!(!f.exists(COPY), "the copy was left behind");
        assert_eq!(done.kept_as, None);
    }

    #[test]
    fn keeping_theirs_puts_their_version_in_the_note() {
        let f = text_fixture("resolve-keep-theirs");

        f.resolve(Resolution::KeepTheirs).expect("the resolution succeeds");

        assert_eq!(f.read("note.md"), "# Note\ntheirs\nend\n");
        assert!(!f.exists(COPY), "the copy was left behind");
    }

    #[test]
    fn a_merged_resolution_is_written_as_given() {
        let f = text_fixture("resolve-merged");

        f.resolve(Resolution::Merged {
            contents: "# Note\nmine\ntheirs\nend\n".into(),
        })
        .expect("the resolution succeeds");

        assert_eq!(f.read("note.md"), "# Note\nmine\ntheirs\nend\n");
        assert!(!f.exists(COPY), "the copy was left behind");
    }

    /// The escape hatch: the copy is renamed after whoever made it, so both
    /// versions survive and the pair is never offered again.
    #[test]
    fn keeping_both_renames_the_copy_after_its_provider() {
        let f = text_fixture("resolve-keep-both");

        let done = f.resolve(Resolution::KeepBoth).expect("the resolution succeeds");

        assert_eq!(done.kept_as.as_deref(), Some("note (Syncthing).md"));
        assert_eq!(f.read("note (Syncthing).md"), "# Note\ntheirs\nend\n");
        assert_eq!(f.read("note.md"), "# Note\nmine\nend\n");
        assert!(!f.exists(COPY), "the copy kept its old name too");
        assert_eq!(
            conflict::pair(done.kept_as.as_deref().expect("a name"), |_| true),
            None,
            "the kept copy still looks like a conflict, so it will be offered again"
        );
    }

    #[test]
    fn keeping_both_twice_does_not_overwrite_the_first_one() {
        let f = text_fixture("resolve-keep-both-twice");
        fs::write(f.vault.join("note (Syncthing).md"), "an earlier one").expect("written");

        let done = f.resolve(Resolution::KeepBoth).expect("the resolution succeeds");

        assert_eq!(done.kept_as.as_deref(), Some("note (Syncthing 2).md"));
        assert_eq!(f.read("note (Syncthing).md"), "an earlier one");
    }

    /// The undo the whole feature promises. Both versions have to be in the
    /// checkpoint before anything is overwritten, or "you can always go back"
    /// is not true.
    #[test]
    fn both_versions_are_checkpointed_before_the_note_is_overwritten() {
        let f = text_fixture("resolve-checkpoint");

        let done = f.resolve(Resolution::KeepTheirs).expect("the resolution succeeds");

        let repo = f.engine.repository();
        let tree = repo
            .find_commit(gix::ObjectId::from_hex(done.checkpoint.as_bytes()).expect("an id"))
            .expect("the checkpoint exists")
            .tree()
            .expect("the tree exists");
        for (path, expected) in [("note.md", "# Note\nmine\nend\n"), (COPY, "# Note\ntheirs\nend\n")] {
            let entry = tree
                .lookup_entry_by_path(path)
                .expect("the lookup succeeds")
                .unwrap_or_else(|| panic!("{path} is not in the checkpoint"));
            let blob = entry.object().expect("the blob exists");
            assert_eq!(
                String::from_utf8_lossy(&blob.data),
                expected,
                "{path} was checkpointed as something other than its pre-resolution content"
            );
        }
    }

    /// The race the whole compare-and-swap exists for: the daemon delivers a
    /// newer version between the panel opening and the user clicking. Writing
    /// then would overwrite content nobody has seen — from either side, since
    /// the daemon is as free to rewrite the note as the copy.
    #[test]
    fn a_side_that_changed_since_it_was_read_aborts_the_write() {
        for (name, moved) in [("resolve-moved-theirs", COPY), ("resolve-moved-ours", "note.md")] {
            let f = text_fixture(name);
            let seen = f.view();
            fs::write(f.vault.join(moved), "# Note\nsomeone else\nend\n").expect("rewritten");
            let before = f.read("note.md");

            let refused = f
                .resolve_as_seen(&seen, Resolution::KeepTheirs)
                .expect_err("the write should have been refused");

            assert_eq!(refused.code, "sync.conflict_moved", "{moved} moving was not noticed");
            assert_eq!(f.read("note.md"), before, "the note was written anyway");
            assert!(f.exists(COPY), "the copy was removed by a refused resolution");
        }
    }

    /// A refused resolution must leave no restore point either, or the history
    /// fills with checkpoints for decisions that never happened.
    #[test]
    fn a_refused_resolution_takes_no_checkpoint() {
        let f = text_fixture("resolve-refused-checkpoint");
        let seen = f.view();
        fs::write(f.vault.join(COPY), "moved").expect("the copy is rewritten");

        f.resolve_as_seen(&seen, Resolution::KeepOurs)
            .expect_err("the write should have been refused");

        assert_eq!(
            super::super::snapshot::checkpoint_head(&f.engine.repository())
                .expect("reading the checkpoint ref succeeds"),
            None,
            "a checkpoint was taken for a resolution that never happened"
        );
    }

    /// Two images are not a thing to segment into lines, so the panel gets
    /// sizes and dates and a whole-file choice.
    #[test]
    fn a_binary_conflict_is_offered_as_whole_files() {
        let f = fixture("resolve-binary", b"PNG\x00mine", b"PNG\x00theirs");

        let seen = f.view();

        assert_eq!(seen.summary.kind, Kind::Binary);
        assert!(seen.chunks.is_empty());
        assert_eq!(seen.summary.ours.byte_size, 8);
    }

    #[test]
    fn a_binary_conflict_can_still_be_resolved_whole() {
        let f = fixture("resolve-binary-keep", b"PNG\x00mine", b"PNG\x00theirs");

        f.resolve(Resolution::KeepTheirs).expect("the resolution succeeds");

        assert_eq!(fs::read(f.vault.join("note.md")).expect("readable"), b"PNG\x00theirs");
    }

    /// Text assembled from chunks that were never produced would be written
    /// straight over an image.
    #[test]
    fn a_binary_conflict_refuses_a_merged_resolution() {
        let f = fixture("resolve-binary-merged", b"PNG\x00mine", b"PNG\x00theirs");

        let refused = f
            .resolve(Resolution::Merged { contents: "nonsense".into() })
            .expect_err("a merge of two binaries should have been refused");

        assert_eq!(refused.code, "sync.not_mergeable");
        assert_eq!(fs::read(f.vault.join("note.md")).expect("readable"), b"PNG\x00mine");
    }

    /// The resolution write is deliberately *not* echo-suppressed. The note's
    /// content changed under an editor that is probably open on it, and the
    /// copy beside it left the file list — the watcher's ordinary "someone else
    /// wrote this" path is what refreshes every window showing this vault, and
    /// claiming the echo would silence exactly that.
    #[test]
    fn a_resolution_is_announced_like_any_other_outside_write() {
        let f = text_fixture("resolve-announced");

        f.resolve(Resolution::KeepTheirs).expect("the resolution succeeds");

        assert!(
            !crate::commands::watcher::take_self_write(&f.vault.join("note.md")),
            "the resolution claimed its own echo, so no open editor will reload the note"
        );
    }

    /// Two windows, or one impatient double-click, on the same conflict. Only
    /// one of them may report success, and the vault must be left in the state
    /// that one produced rather than some interleaving of all four.
    ///
    /// This does not prove the mutation lock: removing it leaves the test
    /// passing, because a resolution ends by deleting the copy and only one
    /// caller can do that. The lock is there for the interleaving this cannot
    /// reach — an ordinary note save landing between the read and the write.
    #[test]
    fn simultaneous_resolutions_of_one_conflict_land_exactly_once() {
        let f = std::sync::Arc::new(text_fixture("resolve-concurrent"));
        let seen = f.view();

        let outcomes: Vec<bool> = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..4)
                .map(|_| {
                    let f = std::sync::Arc::clone(&f);
                    let seen = seen.clone();
                    scope.spawn(move || f.resolve_as_seen(&seen, Resolution::KeepTheirs).is_ok())
                })
                .collect();
            handles.into_iter().map(|h| h.join().expect("the thread finishes")).collect()
        });

        assert_eq!(
            outcomes.iter().filter(|landed| **landed).count(),
            1,
            "a conflict was resolved more than once"
        );
        assert_eq!(f.read("note.md"), "# Note\ntheirs\nend\n");
        assert!(!f.exists(COPY));
    }

    /// Once answered, the conflict is gone from the set the panel reads — the
    /// user should not be asked again about a decision they already made.
    #[test]
    fn a_resolved_conflict_is_no_longer_outstanding() {
        let f = text_fixture("resolve-forget");
        f.engine.note_conflicts(conflict::scan(&f.vault));
        assert_eq!(f.engine.conflicts().len(), 1, "the conflict was not noticed");

        f.resolve(Resolution::KeepOurs).expect("the resolution succeeds");

        assert!(f.engine.conflicts().is_empty(), "the answered conflict is still listed");
    }
}

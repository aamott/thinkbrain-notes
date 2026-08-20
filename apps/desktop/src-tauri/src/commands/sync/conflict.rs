//! Recognising the copies a sync daemon leaves behind.
//!
//! When two machines edit the same note, no cloud daemon merges it. Each one
//! keeps both versions by renaming one of them, and the user is left with two
//! files and no idea which is theirs. Finding those pairs is what turns a mess
//! in a folder into something the app can offer to resolve.
//!
//! This is a table of filename shapes, not a set of provider integrations.
//! Nothing here talks to OneDrive or Syncthing; it reads names off a disk that
//! something else is syncing.

use std::path::Path;

use crate::NativeError;

/// How much we actually know about a pattern.
///
/// Recorded per row because it changes what the row is allowed to do. Every
/// provider documents its conflict naming somewhere, and the documentation is
/// not reliably what ships — so a row nobody has seen produce a real file is
/// marked as such rather than quietly trusted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Evidence {
    /// A real file in this shape has been seen — because a daemon produced one,
    /// or because this app writes them itself.
    Fixture,
    /// Taken from documentation or reports. Believed, not witnessed.
    Documented,
}

/// One provider's way of naming a conflict copy.
pub struct ConflictPattern {
    /// Shown to the user: "Keep OneDrive's".
    pub provider: &'static str,
    #[allow(
        dead_code,
        reason = "read by the test that holds each row honest, and by story 4's UI"
    )]
    pub evidence: Evidence,
    /// Recovers the original file name from a conflict copy's name.
    match_name: fn(&str) -> Option<String>,
}

/// A conflict copy, and the note it is a copy of.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConflictCopy {
    /// Vault-relative path of the copy the daemon made.
    pub copy: String,
    /// Vault-relative path of the note it was copied from.
    pub original: String,
    pub provider: &'static str,
}

/// Splits a file name into stem and extension, keeping the dot with the
/// extension. `note.md` -> `("note", ".md")`, `notes` -> `("notes", "")`.
///
/// Splits on the *last* dot, and never on a leading one, so a dotfile keeps its
/// name intact rather than becoming an extension with an empty stem.
pub fn split_extension(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(index) if index > 0 => (&name[..index], &name[index..]),
        _ => (name, ""),
    }
}

/// Syncthing: `note.sync-conflict-20260816-093100-K3SDFHG.md`.
///
/// The most reliably recognisable of the lot — the marker is unmistakable and
/// unlikely to occur in a name a person chose.
fn syncthing(name: &str) -> Option<String> {
    const MARKER: &str = ".sync-conflict-";
    let start = name.find(MARKER)?;
    let (_, extension) = split_extension(name);
    let rest = &name[start + MARKER.len()..];
    let rest = rest.strip_suffix(extension).unwrap_or(rest);

    // date-time-device, so three hyphen-separated parts and nothing empty.
    let parts: Vec<&str> = rest.split('-').collect();
    if parts.len() != 3 || parts.iter().any(|part| part.is_empty()) {
        return None;
    }
    if !parts[0].chars().all(|c| c.is_ascii_digit())
        || !parts[1].chars().all(|c| c.is_ascii_digit())
    {
        return None;
    }

    Some(format!("{}{}", &name[..start], extension))
}

/// Dropbox: `note (Adam's conflicted copy 2026-08-16).md`.
///
/// The date is anchored so a note someone legitimately named `meeting (Adam's
/// conflicted copy notes).md` is not paired against `meeting.md` and offered up
/// for "resolution". The marker alone is not enough.
fn dropbox(name: &str) -> Option<String> {
    let (stem, extension) = split_extension(name);
    let open = stem.rfind(" (")?;
    let inside = stem[open + 2..].strip_suffix(')')?;
    let after = inside.find("conflicted copy")?;
    if !date_like(&inside[after + "conflicted copy".len()..]) {
        return None;
    }
    Some(format!("{}{}", &stem[..open], extension))
}

/// Whether `rest` begins with a Dropbox/Nextcloud conflict date
/// (`2026-08-16`, optionally followed by a time). The marker alone is too loose
/// — a person can name a note anything — so the date is what makes a copy a
/// copy rather than a coincidence.
fn date_like(rest: &str) -> bool {
    let rest = rest.trim_start();
    let bytes = rest.as_bytes();
    bytes.len() >= 10
        && bytes[..4].iter().all(|b| b.is_ascii_digit())
        && bytes[4] == b'-'
        && bytes[5..7].iter().all(|b| b.is_ascii_digit())
        && bytes[7] == b'-'
        && bytes[8..10].iter().all(|b| b.is_ascii_digit())
}

/// Ours: `note (from another device).md`, and ` 2`, ` 3` if one is already
/// there.
///
/// A pull cannot decide every note, and what it could not decide is written
/// into the vault in the shape a sync daemon would have used — so the panel,
/// the merge view and the settle rules all apply to it without any of them
/// learning where it came from.
fn another_device(name: &str) -> Option<String> {
    let (stem, extension) = split_extension(name);
    let open = stem.rfind(FROM_ANOTHER_DEVICE)?;
    let counter = stem[open + FROM_ANOTHER_DEVICE.len()..].strip_suffix(')')?;
    let numbered = counter.is_empty()
        || counter
            .strip_prefix(' ')
            .is_some_and(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()));
    numbered.then(|| format!("{}{}", &stem[..open], extension))
}

const FROM_ANOTHER_DEVICE: &str = " (from another device";

/// The most numbered copies we scan for before falling back to a unique name.
/// Bounds the work on a vault that someone has filled with thousands of
/// `note (from another device N).md` files, rather than stating every one.
const BESIDE_CAP: usize = 1_000;

/// The unresolved-conflict slot for `original`: `note (from another device).md`.
///
/// Numbered names are only for when this slot is occupied by something that is
/// not this conflict. An interrupted sync that already wrote the slot must
/// reuse it, or the next attempt stacks ` 2`, then ` 3`.
pub fn slot(original: &str) -> String {
    let (directory, name) = dir_and_name(original);
    let (stem, extension) = split_extension(name);
    format!("{directory}{stem}{FROM_ANOTHER_DEVICE}){extension}")
}

fn dir_and_name(original: &str) -> (&str, &str) {
    match original.rfind('/') {
        Some(index) => (&original[..=index], &original[index + 1..]),
        None => ("", original),
    }
}

/// A free name to put another device's version of `original` beside it at.
///
/// `taken` means the name cannot be reused — a folder sitting on it, or a
/// numbered copy that is already someone else's file. The unnumbered slot is
/// reusable even when a leftover from an interrupted write is already there.
///
/// The search is bounded: after `BESIDE_CAP` numbered names are all taken, a
/// high-resolution timestamp suffix is used instead of scanning further.
pub fn beside(original: &str, taken: impl Fn(&str) -> bool) -> String {
    let unnumbered = slot(original);
    if !taken(&unnumbered) {
        return unnumbered;
    }
    let (directory, name) = dir_and_name(original);
    let (stem, extension) = split_extension(name);
    for nth in 2..=BESIDE_CAP {
        let candidate = format!("{directory}{stem}{FROM_ANOTHER_DEVICE} {nth}){extension}");
        if !taken(&candidate) {
            return candidate;
        }
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    format!("{directory}{stem}{FROM_ANOTHER_DEVICE} {stamp}){extension}")
}

/// [`beside`] against a real vault: reuse the unnumbered slot when it is
/// already a file, and only number past a name that cannot be overwritten.
pub fn beside_in(vault: &Path, original: &str) -> String {
    beside(original, |path| occupant_blocks(vault, original, path))
}

fn occupant_blocks(vault: &Path, original: &str, path: &str) -> bool {
    let present = vault.join(path);
    if !present.exists() {
        return false;
    }
    // A leftover copy of this conflict is the slot, not a collision.
    !(path == slot(original) && present.is_file())
}

/// Nextcloud: `note (conflicted copy 2026-08-16 093100).md`.
///
/// Same shape as Dropbox without the owner's name, so `dropbox` already
/// recognises it; kept as its own row so the user is told the right provider.
/// `starts_with` is what keeps Dropbox's owner-prefixed names out of this row,
/// and the date anchor keeps ordinary notes out of both.
fn nextcloud(name: &str) -> Option<String> {
    let (stem, extension) = split_extension(name);
    let open = stem.rfind(" (")?;
    let inside = stem[open + 2..].strip_suffix(')')?;
    if !inside.starts_with("conflicted copy") {
        return None;
    }
    if !date_like(&inside["conflicted copy".len()..]) {
        return None;
    }
    Some(format!("{}{}", &stem[..open], extension))
}

/// The patterns, most confidently recognised first.
///
/// Order matters only for which provider gets named when two rows match the
/// same file; the pairing is identical either way.
pub const PATTERNS: &[ConflictPattern] = &[
    ConflictPattern {
        provider: "Syncthing",
        evidence: Evidence::Documented,
        match_name: syncthing,
    },
    ConflictPattern {
        provider: "Nextcloud",
        evidence: Evidence::Documented,
        match_name: nextcloud,
    },
    ConflictPattern {
        provider: "Dropbox",
        evidence: Evidence::Documented,
        match_name: dropbox,
    },
    ConflictPattern {
        provider: "another device",
        // The one row that has earned it: we write these ourselves.
        evidence: Evidence::Fixture,
        match_name: another_device,
    },
];

/// Pairs a vault-relative path with the note it is a conflict copy of.
///
/// `original_exists` decides whether the pairing is real. A name in a conflict
/// shape whose original is not there is not a conflict — it is a file someone
/// named that way, or one left behind after the original was deleted, and
/// offering to "resolve" it against nothing would be worse than ignoring it.
pub fn pair(relative: &str, original_exists: impl Fn(&str) -> bool) -> Option<ConflictCopy> {
    let (directory, name) = dir_and_name(relative);

    for pattern in PATTERNS {
        let Some(original_name) = (pattern.match_name)(name) else {
            continue;
        };
        if original_name == name {
            continue;
        }
        let original = format!("{directory}{original_name}");
        if !original_exists(&original) {
            continue;
        }
        return Some(ConflictCopy {
            copy: relative.to_string(),
            original,
            provider: pattern.provider,
        });
    }
    None
}

/// Renders a vault-relative path the way this module names things: `/` on every
/// platform, matching the watcher's own relative paths.
pub fn relative_str(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            std::path::Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Whether `relative` is an unresolved conflict copy sitting in `vault`.
///
/// Used to keep the history branch clean. Both sides of a conflict are held by
/// a checkpoint, so nothing is lost by leaving the copy out of history — and
/// putting it in would push a daemon's mess to the user's remote, where their
/// other machine would sync it back down.
pub fn is_conflict_copy(vault: &Path, relative: &Path) -> bool {
    let relative = relative_str(relative);
    pair(&relative, |original| vault.join(original).exists()).is_some()
}

/// Every conflict copy in a vault, as vault-relative paths.
///
/// Run when a workspace opens: conflicts appear while the app is closed, and a
/// user who has been away for a week should not have to touch each file to
/// discover the app noticed nothing.
pub fn scan(vault: &Path) -> Result<Vec<ConflictCopy>, NativeError> {
    let names = super::bootstrap::recordable_notes(vault)?;
    let relative: Vec<String> = names.iter().map(|path| relative_str(path)).collect();
    let present: std::collections::HashSet<&str> = relative.iter().map(String::as_str).collect();

    let mut found: Vec<ConflictCopy> = relative
        .iter()
        .filter_map(|path| pair(path, |original| present.contains(original)))
        .collect();
    found.sort_by(|a, b| a.copy.cmp(&b.copy));
    Ok(found)
}

#[cfg(test)]
#[path = "conflict_tests.rs"]
mod tests;

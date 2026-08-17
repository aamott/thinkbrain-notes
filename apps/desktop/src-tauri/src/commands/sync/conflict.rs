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

/// How much we actually know about a pattern.
///
/// Recorded per row because it changes what the row is allowed to do. Every
/// provider documents its conflict naming somewhere, and the documentation is
/// not reliably what ships — so a row nobody has seen produce a real file is
/// marked as such rather than quietly trusted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Evidence {
    /// A real file produced by the real daemon has been seen in this shape.
    #[allow(dead_code, reason = "no row has earned this yet; see the story's known gaps")]
    Fixture,
    /// Taken from documentation or reports. Believed, not witnessed.
    Documented,
}

/// One provider's way of naming a conflict copy.
pub struct ConflictPattern {
    /// Shown to the user: "Keep OneDrive's".
    pub provider: &'static str,
    #[allow(dead_code, reason = "read by the test that holds each row honest, and by story 4's UI")]
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
fn split_extension(name: &str) -> (&str, &str) {
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
    if !parts[0].chars().all(|c| c.is_ascii_digit()) || !parts[1].chars().all(|c| c.is_ascii_digit())
    {
        return None;
    }

    Some(format!("{}{}", &name[..start], extension))
}

/// Dropbox: `note (Adam's conflicted copy 2026-08-16).md`.
fn dropbox(name: &str) -> Option<String> {
    let (stem, extension) = split_extension(name);
    let open = stem.rfind(" (")?;
    let inside = stem[open + 2..].strip_suffix(')')?;
    if !inside.contains("conflicted copy") {
        return None;
    }
    Some(format!("{}{}", &stem[..open], extension))
}

/// Nextcloud: `note (conflicted copy 2026-08-16 093100).md`.
///
/// Same shape as Dropbox without the owner's name, so `dropbox` already
/// recognises it; kept as its own row so the user is told the right provider.
fn nextcloud(name: &str) -> Option<String> {
    let (stem, extension) = split_extension(name);
    let open = stem.rfind(" (")?;
    let inside = stem[open + 2..].strip_suffix(')')?;
    if !inside.starts_with("conflicted copy") {
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
];

/// Pairs a vault-relative path with the note it is a conflict copy of.
///
/// `original_exists` decides whether the pairing is real. A name in a conflict
/// shape whose original is not there is not a conflict — it is a file someone
/// named that way, or one left behind after the original was deleted, and
/// offering to "resolve" it against nothing would be worse than ignoring it.
pub fn pair(relative: &str, original_exists: impl Fn(&str) -> bool) -> Option<ConflictCopy> {
    let (directory, name) = match relative.rfind('/') {
        Some(index) => (&relative[..=index], &relative[index + 1..]),
        None => ("", relative),
    };

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
pub fn scan(vault: &Path) -> Vec<ConflictCopy> {
    let Ok(names) = super::bootstrap::recordable_notes(vault) else {
        return Vec::new();
    };
    let relative: Vec<String> = names.iter().map(|path| relative_str(path)).collect();
    let present: std::collections::HashSet<&str> =
        relative.iter().map(String::as_str).collect();

    let mut found: Vec<ConflictCopy> = relative
        .iter()
        .filter_map(|path| pair(path, |original| present.contains(original)))
        .collect();
    found.sort_by(|a, b| a.copy.cmp(&b.copy));
    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::make_temp_test_dir;
    use std::fs;

    fn always(_: &str) -> bool {
        true
    }

    #[test]
    fn syncthing_copies_are_paired_with_their_original() {
        let found = pair("note.sync-conflict-20260816-093100-K3SDFHG.md", always)
            .expect("a Syncthing copy is recognised");

        assert_eq!(found.original, "note.md");
        assert_eq!(found.provider, "Syncthing");
    }

    #[test]
    fn dropbox_copies_are_paired_with_their_original() {
        let found = pair("note (Adam's conflicted copy 2026-08-16).md", always)
            .expect("a Dropbox copy is recognised");

        assert_eq!(found.original, "note.md");
        assert_eq!(found.provider, "Dropbox", "the copy was blamed on the wrong provider");
    }

    #[test]
    fn nextcloud_copies_are_paired_with_their_original() {
        let found = pair("note (conflicted copy 2026-08-16 093100).md", always)
            .expect("a Nextcloud copy is recognised");

        assert_eq!(found.original, "note.md");
        assert_eq!(found.provider, "Nextcloud");
    }

    #[test]
    fn a_copy_keeps_the_folder_its_original_is_in() {
        let found = pair(
            "journal/2026/08-16.sync-conflict-20260816-093100-K3SDFHG.md",
            always,
        )
        .expect("a nested copy is recognised");

        assert_eq!(found.original, "journal/2026/08-16.md");
    }

    /// The disambiguator that makes the risky patterns safe to have at all. A
    /// name in a conflict shape whose original is gone is just a file, and
    /// offering to resolve it against nothing would be worse than ignoring it.
    #[test]
    fn a_copy_with_no_original_is_not_a_conflict() {
        assert_eq!(
            pair("note.sync-conflict-20260816-093100-K3SDFHG.md", |_| false),
            None
        );
    }

    /// Carrying the marker is not enough: the tail has to be the shape
    /// Syncthing actually writes, date and time and device. Matching on the
    /// marker alone would claim any note whose name happened to contain it.
    #[test]
    fn the_syncthing_marker_alone_is_not_a_conflict() {
        for name in [
            "note.sync-conflict-draft.md",
            "note.sync-conflict-20260816-093100.md",
            "note.sync-conflict-20260816-093100-K3SDFHG-extra.md",
            "note.sync-conflict-notadate-093100-K3SDFHG.md",
            "note.sync-conflict-20260816-nottime-K3SDFHG.md",
            "note.sync-conflict-20260816--K3SDFHG.md",
        ] {
            assert_eq!(pair(name, always), None, "{name} was mistaken for a conflict");
        }
    }

    /// Ordinary notes must survive contact with this table. A false positive
    /// here tells the user their own file is a conflict and offers to delete
    /// one side of it.
    #[test]
    fn ordinary_notes_are_not_mistaken_for_conflicts() {
        for name in [
            "note.md",
            "meeting (draft).md",
            "sync-conflict.md",
            "a note about the sync-conflict-format.md",
            "notes (1).md",
            "report v2.md",
            "2026-08-16.md",
            ".hidden.md",
            "conflicted copy.md",
        ] {
            assert_eq!(pair(name, always), None, "{name} was mistaken for a conflict");
        }
    }

    /// One original can collect copies from several machines at once.
    #[test]
    fn several_copies_of_one_note_each_pair_with_it() {
        let vault = make_temp_test_dir("conflict-many", "sync", true);
        fs::write(vault.join("note.md"), "mine").expect("the note exists");
        for device in ["K3SDFHG", "P9WERTY"] {
            fs::write(
                vault.join(format!("note.sync-conflict-20260816-093100-{device}.md")),
                "theirs",
            )
            .expect("the copy exists");
        }

        let found = scan(&vault);

        assert_eq!(found.len(), 2);
        assert!(found.iter().all(|copy| copy.original == "note.md"));
    }

    #[test]
    fn a_scan_finds_conflicts_left_while_the_app_was_closed() {
        let vault = make_temp_test_dir("conflict-scan", "sync", true);
        fs::create_dir_all(vault.join("journal")).expect("the folder exists");
        fs::write(vault.join("journal/08-16.md"), "mine").expect("the note exists");
        fs::write(
            vault.join("journal/08-16.sync-conflict-20260816-093100-K3SDFHG.md"),
            "theirs",
        )
        .expect("the copy exists");
        fs::write(vault.join("untouched.md"), "fine").expect("the note exists");

        let found = scan(&vault);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].original, "journal/08-16.md");
        assert_eq!(
            found[0].copy,
            "journal/08-16.sync-conflict-20260816-093100-K3SDFHG.md"
        );
    }

    /// Until someone has watched each daemon produce a real file, the table
    /// says so. This fails the moment a row claims evidence it does not have.
    #[test]
    fn every_pattern_records_what_is_actually_known_about_it() {
        for pattern in PATTERNS {
            assert_eq!(
                pattern.evidence,
                Evidence::Documented,
                "{} claims fixture evidence; the fixture must exist in this file",
                pattern.provider
            );
        }
    }
}

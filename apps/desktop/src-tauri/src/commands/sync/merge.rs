//! Turning two versions of a note into something a person can choose between.
//!
//! The merge UI never sees a conflict marker. It is handed an ordered list of
//! chunks — stretches both versions agree on, and stretches where they differ —
//! and picking a side is picking one string over another. Markers are a
//! serialisation format for a text editor; they are not a data structure, and
//! parsing them back out of a merged buffer would be inventing one.
//!
//! Nothing here touches a disk or a repository, which is what lets every
//! interesting case be a three-line test.

use serde::Serialize;

/// How far into a file we look for the byte that says "not text".
///
/// Git's own rule, and for the same reason: a NUL in the first few kilobytes is
/// a reliable tell, and reading further to be certain would cost a full scan of
/// every attachment in the vault to learn what the first page already said.
const BINARY_SNIFF: usize = 8000;

/// Whether the two versions can be compared line by line at all.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Text,
    /// An image, a PDF, a spreadsheet — anything a line diff would turn into
    /// noise. The UI offers a whole-file choice and shows sizes and dates.
    Binary,
}

/// One stretch of the comparison.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Chunk {
    /// Both versions have this, unchanged.
    Common { text: String },
    /// The versions disagree. Either side may be empty — that is an insertion
    /// on one side rather than a rewrite on both.
    Choice { ours: String, theirs: String },
}

/// Segments two versions of a file into chunks.
///
/// Line terminators stay inside the chunks, so concatenating one side's text
/// across every chunk reproduces that version byte for byte. That is what makes
/// "keep the left side of this chunk and the right of that one" a safe
/// operation rather than an approximation — and it is the property the
/// resolution write depends on.
pub fn compare(ours: &[u8], theirs: &[u8]) -> (Kind, Vec<Chunk>) {
    let (Some(ours), Some(theirs)) = (as_text(ours), as_text(theirs)) else {
        return (Kind::Binary, Vec::new());
    };
    (Kind::Text, segment(ours, theirs))
}

/// Whether these two can be compared line by line, without doing it.
///
/// For the resolution write, which needs the answer to refuse assembled text
/// over a pair of images and has no use for the chunks.
pub fn kind_of(ours: &[u8], theirs: &[u8]) -> Kind {
    match (as_text(ours), as_text(theirs)) {
        (Some(_), Some(_)) => Kind::Text,
        _ => Kind::Binary,
    }
}

/// The file as text, or `None` if it is not the sort of thing to diff.
///
/// Invalid UTF-8 counts as binary rather than as text to be repaired. A Latin-1
/// note would round-trip through a lossy conversion as different bytes, and
/// writing those back as a resolution would corrupt the file the user was
/// trying to save.
fn as_text(bytes: &[u8]) -> Option<&str> {
    if bytes[..bytes.len().min(BINARY_SNIFF)].contains(&0) {
        return None;
    }
    std::str::from_utf8(bytes).ok()
}

fn segment(ours: &str, theirs: &str) -> Vec<Chunk> {
    use gix::diff::blob::{Algorithm, Diff, InternedInput};

    let input = InternedInput::new(ours, theirs);
    let mut diff = Diff::compute(Algorithm::Histogram, &input);
    // Slides the hunk boundaries the way git does, so a chunk starts where a
    // person would say the change starts rather than at the first byte the
    // algorithm happened to notice.
    diff.postprocess_lines(&input);

    let mut chunks = Vec::new();
    // Only our side is tracked: between hunks the two versions agree, so the
    // run of lines is the same one on either side, and after the last hunk the
    // rest of the file is common too.
    let mut ours_at = 0u32;
    for hunk in diff.hunks() {
        push_common(
            &mut chunks,
            join(&input, Side::Ours, ours_at..hunk.before.start),
        );
        push_choice(
            &mut chunks,
            join(&input, Side::Ours, hunk.before.clone()),
            join(&input, Side::Theirs, hunk.after.clone()),
        );
        ours_at = hunk.before.end;
    }
    push_common(
        &mut chunks,
        join(&input, Side::Ours, ours_at..input.before.len() as u32),
    );
    chunks
}

#[derive(Clone, Copy)]
enum Side {
    Ours,
    Theirs,
}

fn join(
    input: &gix::diff::blob::InternedInput<&str>,
    side: Side,
    range: std::ops::Range<u32>,
) -> String {
    let tokens = match side {
        Side::Ours => &input.before,
        Side::Theirs => &input.after,
    };
    tokens[range.start as usize..range.end as usize]
        .iter()
        .map(|token| input.interner[*token])
        .collect()
}

/// Adds a common stretch, unless there is nothing in it.
///
/// Two adjacent hunks, or a change at the very start of the file, would
/// otherwise leave an empty chunk for the UI to render as a blank row.
fn push_common(chunks: &mut Vec<Chunk>, text: String) {
    if !text.is_empty() {
        chunks.push(Chunk::Common { text });
    }
}

fn push_choice(chunks: &mut Vec<Chunk>, ours: String, theirs: String) {
    if !ours.is_empty() || !theirs.is_empty() {
        chunks.push(Chunk::Choice { ours, theirs });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One side of the whole comparison, as the panel assembles it from the
    /// user's picks. Lives here because the panel is the only thing that does
    /// this for real; the tests do it to hold the round-trip property.
    fn side_text(chunks: &[Chunk], side_is_ours: bool) -> String {
        chunks
            .iter()
            .map(|chunk| match chunk {
                Chunk::Common { text } => text.as_str(),
                Chunk::Choice { ours, theirs } => {
                    if side_is_ours {
                        ours.as_str()
                    } else {
                        theirs.as_str()
                    }
                }
            })
            .collect()
    }

    fn chunks(ours: &str, theirs: &str) -> Vec<Chunk> {
        let (kind, chunks) = compare(ours.as_bytes(), theirs.as_bytes());
        assert_eq!(kind, Kind::Text, "the versions were not treated as text");
        chunks
    }

    fn common(text: &str) -> Chunk {
        Chunk::Common {
            text: text.to_string(),
        }
    }

    fn choice(ours: &str, theirs: &str) -> Chunk {
        Chunk::Choice {
            ours: ours.to_string(),
            theirs: theirs.to_string(),
        }
    }

    #[test]
    fn two_identical_versions_are_all_agreement() {
        assert_eq!(
            chunks("# Note\nbody\n", "# Note\nbody\n"),
            [common("# Note\nbody\n")]
        );
    }

    #[test]
    fn a_changed_line_is_a_choice_between_the_lines_around_it() {
        assert_eq!(
            chunks("# Note\nmine\nend\n", "# Note\ntheirs\nend\n"),
            [
                common("# Note\n"),
                choice("mine\n", "theirs\n"),
                common("end\n")
            ]
        );
    }

    /// A line only one side has is still a choice — with an empty option, which
    /// is how "leave it out" is offered.
    #[test]
    fn a_line_one_side_added_is_a_choice_against_nothing() {
        assert_eq!(
            chunks("# Note\nend\n", "# Note\nextra\nend\n"),
            [common("# Note\n"), choice("", "extra\n"), common("end\n")]
        );
    }

    #[test]
    fn a_change_at_the_very_start_leaves_no_empty_chunk_before_it() {
        assert_eq!(
            chunks("mine\nend\n", "theirs\nend\n"),
            [choice("mine\n", "theirs\n"), common("end\n")]
        );
    }

    /// The property everything else rests on: a side of the chunks is that
    /// version, exactly. Anything less and picking "keep mine" would rewrite
    /// the file the user asked to keep.
    #[test]
    fn each_side_of_the_chunks_rebuilds_that_version_exactly() {
        for (ours, theirs) in [
            ("a\nb\nc\n", "a\nB\nc\n"),
            ("", "new\n"),
            ("only mine\n", ""),
            ("no trailing newline", "no trailing newline!"),
            ("windows\r\nlines\r\n", "windows\nlines\n"),
            ("héllo\n— dash —\n", "héllo\n— em —\n"),
            ("one\n\n\nthree\n", "one\nthree\n"),
        ] {
            let (kind, chunks) = compare(ours.as_bytes(), theirs.as_bytes());
            assert_eq!(kind, Kind::Text, "{ours:?} vs {theirs:?} was not text");
            assert_eq!(side_text(&chunks, true), ours, "our side did not rebuild");
            assert_eq!(
                side_text(&chunks, false),
                theirs,
                "their side did not rebuild"
            );
        }
    }

    /// The UI asks again every time it is opened, and a comparison that moved
    /// between two looks at the same files would move the user's selections.
    #[test]
    fn the_same_two_versions_always_segment_the_same_way() {
        let ours = "intro\nalpha\nbeta\nshared\ngamma\n";
        let theirs = "intro\nALPHA\nbeta\nshared\nGAMMA\ndelta\n";

        assert_eq!(chunks(ours, theirs), chunks(ours, theirs));
    }

    /// A line diff of a PNG is noise at best and a corrupted file at worst, so
    /// binary versions are compared as whole files and nothing else.
    #[test]
    fn a_file_with_a_nul_byte_is_never_diffed() {
        let (kind, chunks) = compare(b"PNG\x00\x01\x02mine", b"PNG\x00\x01\x02theirs");

        assert_eq!(kind, Kind::Binary);
        assert!(chunks.is_empty(), "a binary file was segmented");
    }

    /// Text in an encoding that is not UTF-8 cannot survive being turned into a
    /// `String` and written back, so it is offered as a whole-file choice too.
    #[test]
    fn a_file_that_is_not_utf8_is_treated_as_binary() {
        let (kind, _) = compare(&[0xC3, 0x28, b'\n'], b"fine\n");

        assert_eq!(kind, Kind::Binary);
    }

    /// One side being binary is enough: whatever the other side is, there is no
    /// line-by-line comparison to offer between them.
    #[test]
    fn one_binary_side_makes_the_whole_comparison_binary() {
        assert_eq!(compare(b"plain text\n", b"PNG\x00data").0, Kind::Binary);
    }

    /// A NUL past the sniff window is a file we call text. That is git's
    /// bargain, and the test exists so the choice is deliberate rather than an
    /// accident of the constant.
    #[test]
    fn a_nul_beyond_the_sniff_window_does_not_make_a_file_binary() {
        let mut long = vec![b'a'; BINARY_SNIFF];
        long.push(0);

        assert_eq!(compare(&long, &long).0, Kind::Text);
    }

    #[test]
    fn two_empty_versions_have_nothing_to_choose_between() {
        assert_eq!(chunks("", ""), []);
    }
}

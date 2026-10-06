//! Deciding whether two versions of a note can be compared as text at all.
//!
//! The merge UI never sees a conflict marker, and the native side never sends
//! one: for text it hands over the two complete documents and lets the
//! frontend's own differ align them, and for anything else it hands over
//! nothing but the verdict. Markers and segmented chunks are both a second
//! representation of the same pair — one more thing to get wrong on the way
//! to the write.
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

/// The two versions as text, in the order they were given.
///
/// `None` when either side is not text — which is also the answer `kind_of`
/// reports, so the classifier and the comparison can never disagree about
/// whether a pair was readable.
pub fn text_pair<'a>(first: &'a [u8], second: &'a [u8]) -> Option<(&'a str, &'a str)> {
    Some((as_text(first)?, as_text(second)?))
}

/// Whether these two can be compared line by line.
///
/// For the resolution write, which needs the answer to refuse assembled text
/// over a pair of images and has no use for the documents themselves.
pub fn kind_of(first: &[u8], second: &[u8]) -> Kind {
    if text_pair(first, second).is_some() {
        Kind::Text
    } else {
        Kind::Binary
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

#[cfg(test)]
mod tests {
    use super::*;

    /// The comparison hands the frontend both complete documents, exactly as
    /// they were read — anything less and "put the recorded version back"
    /// would restore something other than what was shown.
    #[test]
    fn text_versions_come_through_complete_and_in_order() {
        let (first, second) =
            text_pair(b"# Note\nmine\nend\n", b"# Note\ntheirs\nend\n").expect("text is text");

        assert_eq!(first, "# Note\nmine\nend\n");
        assert_eq!(second, "# Note\ntheirs\nend\n");
        assert_eq!(
            kind_of(b"# Note\nmine\nend\n", b"# Note\ntheirs\nend\n"),
            Kind::Text
        );
    }

    /// Two empty files are still text — there is simply nothing to show.
    #[test]
    fn two_empty_versions_are_still_text() {
        assert_eq!(text_pair(b"", b""), Some(("", "")));
        assert_eq!(kind_of(b"", b""), Kind::Text);
    }

    /// Text beyond ASCII is still text, byte for byte.
    #[test]
    fn text_beyond_ascii_is_text() {
        let (first, second) = text_pair(
            "# ノート\ncafé\n".as_bytes(),
            "# ノート\nemoji ☕️\n".as_bytes(),
        )
        .expect("utf-8 is text");

        assert_eq!(first, "# ノート\ncafé\n");
        assert_eq!(second, "# ノート\nemoji ☕️\n");
    }

    /// A line diff of a PNG is noise at best and a corrupted file at worst, so
    /// binary versions are compared as whole files and nothing else.
    #[test]
    fn a_file_with_a_nul_byte_is_never_diffed() {
        assert_eq!(
            text_pair(b"PNG\x00\x01\x02mine", b"PNG\x00\x01\x02theirs"),
            None
        );
        assert_eq!(
            kind_of(b"PNG\x00\x01\x02mine", b"PNG\x00\x01\x02theirs"),
            Kind::Binary
        );
    }

    /// Text in an encoding that is not UTF-8 cannot survive being turned into a
    /// `String` and written back, so it is offered as a whole-file choice too.
    #[test]
    fn a_file_that_is_not_utf8_is_treated_as_binary() {
        assert_eq!(text_pair(&[0xC3, 0x28, b'\n'], b"fine\n"), None);
        assert_eq!(kind_of(&[0xC3, 0x28, b'\n'], b"fine\n"), Kind::Binary);
    }

    /// One side being binary is enough: whatever the other side is, there is no
    /// line-by-line comparison to offer between them.
    #[test]
    fn one_binary_side_makes_the_whole_comparison_binary() {
        assert_eq!(kind_of(b"plain text\n", b"PNG\x00data"), Kind::Binary);
        assert_eq!(kind_of(b"PNG\x00data", b"plain text\n"), Kind::Binary);
    }

    /// A NUL past the sniff window is a file we call text. That is git's
    /// bargain, and the test exists so the choice is deliberate rather than an
    /// accident of the constant.
    #[test]
    fn a_nul_beyond_the_sniff_window_does_not_make_a_file_binary() {
        let mut long = vec![b'a'; BINARY_SNIFF];
        long.push(0);

        assert_eq!(kind_of(&long, &long), Kind::Text);
    }
}

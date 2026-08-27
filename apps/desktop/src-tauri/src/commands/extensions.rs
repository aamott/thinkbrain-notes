//! Extensions Command Module
//!
//! Reads files belonging to an extension loaded from a local directory.
//!
//! A development extension lives in a user-chosen directory outside the
//! workspace and outside app-data, so the Tauri FS plugin's scope does not
//! cover it. `read_extension_file` therefore performs its own containment
//! check: the directory and the resolved file are both canonicalized, and the
//! file must still live inside the directory afterwards. Canonicalization
//! happens before the comparison, so a symlink pointing outside the directory
//! fails the check rather than being followed.
//!
//! This bounds *which file* is read. It is not a sandbox for what the extension
//! does once loaded: a loaded extension is trusted local code running with full
//! application privileges.

use crate::error::{NativeError, failed};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

/// Largest entry module accepted, guarding against reading a huge file into the
/// webview by mistake.
const MAX_EXTENSION_FILE_BYTES: u64 = 8 * 1024 * 1024;

/// Rejects a relative path that is absolute, empty, or leaves the directory.
fn normalize_extension_relative_path(relative_path: &str) -> Result<PathBuf, NativeError> {
    // Manifests are hand-authored and may use either separator; normalize before
    // inspecting components so Windows-style input is validated on Unix hosts.
    let normalized = relative_path.replace('\\', "/");
    let path = Path::new(&normalized);

    if path.is_absolute() {
        return Err(NativeError::new(
            "extensions.invalid_path",
            "Extension file path must be relative to the extension directory.",
        ));
    }

    let mut parts = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                if part.to_string_lossy().trim().is_empty() {
                    return Err(NativeError::new(
                        "extensions.invalid_path",
                        "Extension file path contains an empty segment.",
                    ));
                }
                parts.push(part);
            }
            Component::CurDir => {}
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err(NativeError::new(
                    "extensions.invalid_path",
                    "Extension file path must stay inside the extension directory.",
                ));
            }
        }
    }

    if parts.as_os_str().is_empty() {
        return Err(NativeError::new(
            "extensions.invalid_path",
            "Extension file path must name a file.",
        ));
    }

    Ok(parts)
}

/// Resolves a directory-relative path to a real file inside that directory.
fn resolve_extension_file(directory: &str, relative_path: &str) -> Result<PathBuf, NativeError> {
    let relative = normalize_extension_relative_path(relative_path)?;

    let root = Path::new(directory);
    if !root.is_absolute() {
        return Err(NativeError::new(
            "extensions.invalid_directory",
            "Extension directory must be an absolute path.",
        ));
    }

    let canonical_root = root.canonicalize().map_err(|error| {
        failed(
            "extensions.directory_unavailable",
            "Extension directory could not be read.",
            error,
        )
    })?;

    if !canonical_root.is_dir() {
        return Err(NativeError::new(
            "extensions.invalid_directory",
            "Extension directory is not a directory.",
        ));
    }

    let candidate = canonical_root.join(&relative);
    let canonical_file = candidate.canonicalize().map_err(|error| {
        NativeError::with_details(
            "extensions.file_unavailable",
            format!("Extension file \"{relative_path}\" could not be read."),
            error,
        )
    })?;

    // Canonicalization resolved any symlink, so this rejects a link that points
    // outside the extension directory.
    if !canonical_file.starts_with(&canonical_root) {
        return Err(NativeError::new(
            "extensions.invalid_path",
            "Extension file path must stay inside the extension directory.",
        ));
    }

    if !canonical_file.is_file() {
        return Err(NativeError::new(
            "extensions.invalid_path",
            "Extension file path must name a file.",
        ));
    }

    Ok(canonical_file)
}

/// Reads one UTF-8 file belonging to an extension directory.
///
/// Args:
///   directory: Absolute path of the extension directory the user chose.
///   relative_path: Path of the file within that directory.
///
/// Returns:
///   The file's contents, or a `NativeError` when the path escapes the
///   directory, the file is missing, or it is too large to be an entry module.
#[tauri::command]
pub fn read_extension_file(
    directory: String,
    relative_path: String,
) -> Result<String, NativeError> {
    let path = resolve_extension_file(&directory, &relative_path)?;

    let mut file = fs::File::open(&path).map_err(|error| {
        failed(
            "extensions.file_unavailable",
            "Extension file could not be read.",
            error,
        )
    })?;

    // Metadata retrieved from the open file handle is bound to the same
    // inode that passed the containment check, preventing TOCTOU races.
    let metadata = file.metadata().map_err(|error| {
        failed(
            "extensions.file_unavailable",
            "Extension file could not be read.",
            error,
        )
    })?;

    if metadata.len() > MAX_EXTENSION_FILE_BYTES {
        return Err(NativeError::new(
            "extensions.file_too_large",
            "Extension file is larger than the 8 MB limit.",
        ));
    }

    // Reading from the same file handle ensures the bytes come from the
    // same inode that passed the size check.
    let mut contents = String::new();
    file.read_to_string(&mut contents).map_err(|error| {
        failed(
            "extensions.file_unavailable",
            "Extension file is not valid UTF-8 text or could not be read.",
            error,
        )
    })?;

    Ok(contents)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Creates a unique temp directory for a test and returns its path.
    fn temp_test_dir(name: &str) -> PathBuf {
        crate::tests::make_temp_test_dir(name, "extensions", false)
    }

    #[test]
    fn reads_a_file_inside_the_extension_directory() {
        let dir = temp_test_dir("read");
        fs::write(dir.join("extension.js"), "export function activate() {}")
            .expect("entry is written");

        let contents = read_extension_file(
            dir.to_string_lossy().into_owned(),
            "extension.js".to_string(),
        )
        .expect("file is read");

        assert_eq!(contents, "export function activate() {}");
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn reads_a_file_in_a_subdirectory() {
        let dir = temp_test_dir("subdir");
        fs::create_dir_all(dir.join("dist")).expect("subdirectory is created");
        fs::write(dir.join("dist/main.js"), "bundled").expect("entry is written");

        let contents = read_extension_file(
            dir.to_string_lossy().into_owned(),
            "dist/main.js".to_string(),
        )
        .expect("file is read");

        assert_eq!(contents, "bundled");
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn rejects_a_parent_directory_escape() {
        let dir = temp_test_dir("escape");
        let outside = dir.parent().expect("temp root").join("outside.js");
        fs::write(&outside, "secret").expect("outside file is written");

        let error = read_extension_file(
            dir.to_string_lossy().into_owned(),
            "../outside.js".to_string(),
        )
        .expect_err("escape is rejected");

        assert_eq!(error.code, "extensions.invalid_path");
        fs::remove_file(outside).ok();
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn rejects_an_absolute_relative_path() {
        let dir = temp_test_dir("absolute");

        let error = read_extension_file(
            dir.to_string_lossy().into_owned(),
            "/etc/hostname".to_string(),
        )
        .expect_err("absolute path is rejected");

        assert_eq!(error.code, "extensions.invalid_path");
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn rejects_a_relative_extension_directory() {
        let error = read_extension_file("./relative".to_string(), "extension.js".to_string())
            .expect_err("relative directory is rejected");

        assert_eq!(error.code, "extensions.invalid_directory");
    }

    #[test]
    fn reports_a_missing_file() {
        let dir = temp_test_dir("missing");

        let error = read_extension_file(
            dir.to_string_lossy().into_owned(),
            "extension.js".to_string(),
        )
        .expect_err("missing file is reported");

        assert_eq!(error.code, "extensions.file_unavailable");
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn rejects_a_directory_as_the_entry() {
        let dir = temp_test_dir("isdir");
        fs::create_dir_all(dir.join("dist")).expect("subdirectory is created");

        let error = read_extension_file(dir.to_string_lossy().into_owned(), "dist".to_string())
            .expect_err("a directory is not a file");

        assert_eq!(error.code, "extensions.invalid_path");
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlink_pointing_outside_the_directory() {
        let dir = temp_test_dir("symlink");
        let outside = dir.parent().expect("temp root").join("linked-secret.js");
        fs::write(&outside, "secret").expect("outside file is written");
        std::os::unix::fs::symlink(&outside, dir.join("extension.js")).expect("symlink is created");

        let error = read_extension_file(
            dir.to_string_lossy().into_owned(),
            "extension.js".to_string(),
        )
        .expect_err("escaping symlink is rejected");

        assert_eq!(error.code, "extensions.invalid_path");
        fs::remove_file(outside).ok();
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn rejects_a_file_exceeding_the_size_limit() {
        let dir = temp_test_dir("oversized");
        let oversized = dir.join("huge.js");

        let mut file = fs::File::create(&oversized).expect("file is created");
        use std::io::Write;
        file.write_all(&vec![b'x'; (MAX_EXTENSION_FILE_BYTES + 1) as usize])
            .expect("oversized content is written");
        drop(file);

        let error = read_extension_file(dir.to_string_lossy().into_owned(), "huge.js".to_string())
            .expect_err("oversized file is rejected");

        assert_eq!(error.code, "extensions.file_too_large");
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn rejects_a_non_utf8_file() {
        let dir = temp_test_dir("invalid-utf8");
        let invalid = dir.join("binary.js");

        fs::write(&invalid, b"\x80\x81\x82\x83").expect("non-UTF-8 content is written");

        let error =
            read_extension_file(dir.to_string_lossy().into_owned(), "binary.js".to_string())
                .expect_err("non-UTF-8 file is rejected");

        assert_eq!(error.code, "extensions.file_unavailable");
        fs::remove_dir_all(dir).expect("cleanup");
    }
}

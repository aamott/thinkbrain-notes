//! Auto Sync native layer.
//!
//! See `plans/pending-auto_sync-med-hard.md`. The hidden repository is the
//! foundation everything else stands on: version history, the merge base, and
//! the repository git sync pushes from are all the same repo, and it lives in
//! OS app-data rather than the vault so that no sync daemon ever sees it.

use crate::NativeError;

pub(super) fn failed(
    code: &'static str,
    message: &'static str,
    error: impl std::fmt::Display,
) -> NativeError {
    NativeError::with_details(code, message, error.to_string())
}

pub(super) fn remote_unreachable(error: impl std::fmt::Display) -> NativeError {
    let details = redact_remote_credentials(&error.to_string());
    NativeError::with_details(
        "sync.remote_unreachable",
        "Could not reach the place these notes sync to.",
        details,
    )
}

/// Turns the few HTTP answers a person can act on into distinct messages.
///
/// gix currently exposes these HTTP statuses inside an I/O error's text rather
/// than as an enum. Keep the matching here, rather than teaching every fetch
/// and push call site its own slightly different set of strings.
pub(super) fn remote_failure(error: impl std::fmt::Display) -> NativeError {
    let details = error.to_string();
    let lowercase = details.to_lowercase();
    let (code, message) = if lowercase.contains("failed to obtain credentials")
        || lowercase.contains("configure credential helpers")
        || lowercase.contains("credentials_unavailable")
    {
        (
            "sync.credentials_unavailable",
            "Could not read the saved sign-in from this computer's keychain.",
        )
    } else if details.contains("HTTP status 401")
        || lowercase.contains("invalid credential")
        || lowercase.contains("empty credential")
        || lowercase.contains("no credentials were returned")
    {
        (
            "sync.credentials_invalid",
            "The username or access token was not accepted.",
        )
    } else if details.contains("HTTP status 403")
        || lowercase.contains("permission denied")
        || lowercase.contains("forbidden")
    {
        (
            "sync.credentials_forbidden",
            "The access token does not have permission to use this git link.",
        )
    } else if details.contains("HTTP status 404") {
        (
            "sync.remote_not_found",
            "Could not find a git repository at this link, or this token cannot access it.",
        )
    } else {
        return remote_unreachable(details);
    };
    NativeError::with_details(code, message, redact_remote_credentials(&details))
}

/// Transport diagnostics are useful for DNS/TLS/proxy failures, but must never
/// echo a legacy `https://user:token@host` destination back to the window.
fn redact_remote_credentials(details: &str) -> String {
    let mut output = String::with_capacity(details.len());
    let mut rest = details;
    while let Some(scheme) = rest.find("://") {
        let authority = scheme + 3;
        output.push_str(&rest[..authority]);
        let after_scheme = &rest[authority..];
        let authority_end = after_scheme
            .find(|character: char| matches!(character, '/' | '?' | '#' | ' ' | '\n' | '\t'))
            .unwrap_or(after_scheme.len());
        let authority_text = &after_scheme[..authority_end];
        if let Some(at) = authority_text.rfind('@') {
            output.push_str("[redacted]@");
            output.push_str(&authority_text[at + 1..]);
        } else {
            output.push_str(authority_text);
        }
        rest = &after_scheme[authority_end..];
    }
    output.push_str(rest);
    output
}

mod apply;
pub mod bootstrap;
pub mod conflict;
pub mod credentials;
pub mod engine;
pub mod hidden_repo;
pub mod history;
pub mod import;
pub mod maintain;
pub mod merge;
mod network;
pub mod pending;
pub mod push;
pub mod registry;
pub mod resolve;
pub mod round;
pub mod settle;
pub mod sign_in;
pub mod snapshot;
pub mod status;

#[cfg(test)]
#[path = "test_support.rs"]
mod test_support;

#[cfg(test)]
#[path = "live_host_tests.rs"]
mod live_host;

#[cfg(test)]
mod tests {
    use super::{redact_remote_credentials, remote_failure};

    #[test]
    fn http_failures_do_not_all_sound_like_a_broken_link() {
        for (status, code) in [
            (401, "sync.credentials_invalid"),
            (403, "sync.credentials_forbidden"),
            (404, "sync.remote_not_found"),
        ] {
            let error = remote_failure(format!("Received HTTP status {status}"));
            assert_eq!(error.code, code);
        }
    }

    #[test]
    fn a_keychain_failure_is_not_reported_as_a_bad_link() {
        let error = remote_failure("Failed to obtain credentials");

        assert_eq!(error.code, "sync.credentials_unavailable");
        assert_eq!(
            error.message,
            "Could not read the saved sign-in from this computer's keychain."
        );
    }

    #[test]
    fn a_fetch_with_no_saved_credentials_is_not_reported_as_a_bad_link() {
        let error = remote_failure(
            "No credentials were returned at all as if the credential helper isn't functioning",
        );

        assert_eq!(error.code, "sync.credentials_invalid");
    }

    #[test]
    fn transport_diagnostics_redact_legacy_link_credentials() {
        assert_eq!(
            redact_remote_credentials("could not reach https://me:token@example.test/notes.git"),
            "could not reach https://[redacted]@example.test/notes.git"
        );
    }
}

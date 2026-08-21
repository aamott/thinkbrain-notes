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
/// than as an enum, and wraps them in layers of `Io(Custom { ... })` whose
/// `Display` only shows "An IO error occurred when talking to the server".
/// We walk the full `std::error::Error::source()` chain so the HTTP status
/// buried inside is actually seen. Keep the matching here, rather than
/// teaching every fetch and push call site its own slightly different set of
/// strings.
pub(super) fn remote_failure<E: std::error::Error>(error: E) -> NativeError {
    // Collect the top-level message plus every source in the chain, so the
    // HTTP status string buried inside `Io(Custom { error: "HTTP status 403" })`
    // is visible to the matchers below.
    let mut details = error.to_string();
    let mut source = error.source();
    while let Some(err) = source {
        let msg = err.to_string();
        if !msg.is_empty() && !details.contains(&msg) {
            details.push_str(": ");
            details.push_str(&msg);
        }
        source = err.source();
    }
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

    /// A minimal error type for testing `remote_failure` with string messages,
    /// since the function now requires `std::error::Error` to walk the source
    /// chain (gix wraps HTTP statuses deep inside `Io(Custom { ... })`).
    #[derive(Debug)]
    struct TestError(String);
    impl std::fmt::Display for TestError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.write_str(&self.0)
        }
    }
    impl std::error::Error for TestError {}

    #[test]
    fn http_failures_do_not_all_sound_like_a_broken_link() {
        for (status, code) in [
            (401, "sync.credentials_invalid"),
            (403, "sync.credentials_forbidden"),
            (404, "sync.remote_not_found"),
        ] {
            let error = remote_failure(TestError(format!(
                "Received HTTP status {status}"
            )));
            assert_eq!(error.code, code);
        }
    }

    #[test]
    fn a_keychain_failure_is_not_reported_as_a_bad_link() {
        let error = remote_failure(TestError("Failed to obtain credentials".to_string()));

        assert_eq!(error.code, "sync.credentials_unavailable");
        assert_eq!(
            error.message,
            "Could not read the saved sign-in from this computer's keychain."
        );
    }

    #[test]
    fn a_fetch_with_no_saved_credentials_is_not_reported_as_a_bad_link() {
        let error = remote_failure(TestError(
            "No credentials were returned at all as if the credential helper isn't functioning"
                .to_string(),
        ));

        assert_eq!(error.code, "sync.credentials_invalid");
    }

    #[test]
    fn an_http_status_buried_in_an_io_error_source_chain_is_still_matched() {
        // gix wraps HTTP statuses inside layers of `Io(Custom { ... })` whose
        // `Display` only shows "An IO error occurred when talking to the
        // server". The source chain must be walked to find the status.
        use std::sync::OnceLock;

        #[derive(Debug)]
        struct OuterError;
        impl std::fmt::Display for OuterError {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("An IO error occurred when talking to the server")
            }
        }
        impl std::error::Error for OuterError {
            fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
                static INNER: OnceLock<InnerError> = OnceLock::new();
                Some(INNER.get_or_init(|| InnerError))
            }
        }
        #[derive(Debug)]
        struct InnerError;
        impl std::fmt::Display for InnerError {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("Received HTTP status 403")
            }
        }
        impl std::error::Error for InnerError {}

        let error = remote_failure(OuterError);
        assert_eq!(error.code, "sync.credentials_forbidden");
    }

    #[test]
    fn transport_diagnostics_redact_legacy_link_credentials() {
        assert_eq!(
            redact_remote_credentials("could not reach https://me:token@example.test/notes.git"),
            "could not reach https://[redacted]@example.test/notes.git"
        );
    }
}

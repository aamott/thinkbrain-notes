//! OS keychain for the one remote a vault syncs to.
//!
//! The token never lives in settings JSON, the vault, or a log line. A URL
//! pasted with a username and password is split on first use: the secret goes
//! here, the destination keeps only the place.

use std::sync::Mutex;

use crate::NativeError;
use crate::error::lock_or_recover;

use super::failed;

/// Keychain service name, shared by every entry this app writes.
const SERVICE: &str = "ThinkBrain Notes";

/// Keychain account used only to prove the backend answers. Never written.
const STORAGE_PROBE: &str = "profile:__storage_probe";

/// Serialises access to the store. Some backends are not re-entrant, and a
/// round trip can read credentials from more than one thread.
static KEYCHAIN: Mutex<()> = Mutex::new(());

thread_local! {
    static BOUND_PROFILE: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) };
}

/// Whether the OS keychain (or the in-memory test stand-in) can be asked.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)] // Unavailable/Unsupported are constructed only in non-test builds.
pub enum StorageKind {
    Available,
    Unavailable,
    Unsupported,
}

/// Username and password for `destination`, if we have one.
///
/// When a profile ID is bound for this thread, that profile is the only
/// identity returned — a missing profile does not fall back to another
/// saved sign-in. With no bound profile, the older per-repository URL key
/// is still consulted.
pub fn get(destination: &str) -> Result<Option<(String, String)>, NativeError> {
    if let Some(id) = bound_profile() {
        return get_profile(&id);
    }
    get_legacy(destination)
}

/// The currently bound profile ID, if a round trip named one.
pub fn bound_profile() -> Option<String> {
    BOUND_PROFILE.with(|slot| slot.borrow().clone())
}

/// Runs `work` with `id` as the only sign-in this thread will offer gix.
pub fn with_profile<T>(id: Option<&str>, work: impl FnOnce() -> T) -> T {
    struct Reset(Option<String>);
    impl Drop for Reset {
        fn drop(&mut self) {
            BOUND_PROFILE.with(|slot| *slot.borrow_mut() = self.0.take());
        }
    }
    let previous = BOUND_PROFILE.with(|slot| slot.replace(id.map(str::to_owned)));
    let _reset = Reset(previous);
    work()
}

/// The older per-repository URL entry, ignoring any bound profile.
pub fn get_legacy(destination: &str) -> Result<Option<(String, String)>, NativeError> {
    read_account(&account(destination))
}

/// Token stored under an opaque profile ID.
pub fn get_profile(id: &str) -> Result<Option<(String, String)>, NativeError> {
    read_account(&profile_account(id))
}

/// Stores the identity for `destination`. `secret` is the token; it is not
/// logged, not returned, and not written anywhere but the OS store.
pub fn store(destination: &str, username: &str, secret: &str) -> Result<(), NativeError> {
    write_account(&account(destination), username, secret)
}

/// Stores the token for one labeled profile. Does not touch any other profile.
pub fn store_profile(id: &str, username: &str, secret: &str) -> Result<(), NativeError> {
    write_account(&profile_account(id), username, secret)
}

fn delete(destination: &str) -> Result<(), NativeError> {
    remove_account(&account(destination))
}

/// Removes one profile's secret. Metadata is the caller's problem.
pub fn delete_profile(id: &str) -> Result<(), NativeError> {
    remove_account(&profile_account(id))
}

fn profile_account(id: &str) -> String {
    format!("profile:{id}")
}

/// Maps a store error onto the sync vocabulary.
///
/// `NoDefaultStore` is the interesting one: it means this platform has nowhere
/// to keep a sign-in, which is a different thing from a keychain that is
/// present and refusing. Callers act on that distinction — see
/// `offer_or_anonymous`.
fn store_failure(error: keyring_core::Error) -> NativeError {
    match error {
        keyring_core::Error::NoDefaultStore => NativeError::new(
            "sync.auth_required",
            "Sign-in is not available on this device yet.",
        ),
        other => failed(
            "sync.credentials_unavailable",
            "Could not use this computer's keychain.",
            other,
        ),
    }
}

/// One entry in the app's slice of the store. Assumes the lock is held.
fn entry(key: &str) -> Result<keyring_core::Entry, NativeError> {
    keyring_core::Entry::new(SERVICE, key).map_err(store_failure)
}

/// Reads without taking the lock, so lock-holding callers can reuse it.
fn read_entry(key: &str) -> Result<Option<(String, String)>, NativeError> {
    match entry(key)?.get_password() {
        Ok(payload) => Ok(decode(&payload)),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(error) => Err(store_failure(error)),
    }
}

fn read_account(key: &str) -> Result<Option<(String, String)>, NativeError> {
    let _guard = lock_or_recover(&KEYCHAIN);
    read_entry(key)
}

fn write_account(key: &str, username: &str, secret: &str) -> Result<(), NativeError> {
    let _guard = lock_or_recover(&KEYCHAIN);
    entry(key)?
        .set_password(&encode(username, secret))
        .map_err(store_failure)
}

fn remove_account(key: &str) -> Result<(), NativeError> {
    let _guard = lock_or_recover(&KEYCHAIN);
    match entry(key)?.delete_credential() {
        Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
        Err(error) => Err(store_failure(error)),
    }
}

/// Asks whether the keychain answers, without writing a secret.
///
/// Reports from what was actually registered at startup rather than from a
/// `cfg!`, so a platform whose store failed to start is honestly reported as
/// unavailable instead of being assumed present.
pub fn storage_status() -> (StorageKind, String) {
    if !crate::credential_store::is_available() {
        return (
            StorageKind::Unsupported,
            "Sign-in is not available on this device yet.".to_string(),
        );
    }
    let _guard = lock_or_recover(&KEYCHAIN);
    match read_entry(STORAGE_PROBE) {
        Ok(_) => (
            StorageKind::Available,
            "This computer can keep a sign-in.".to_string(),
        ),
        Err(error) => (StorageKind::Unavailable, error.message),
    }
}

/// A token form only works for HTTPS, and accepting userinfo here would put a
/// secret back into the URL we deliberately keep secret-free.
pub(super) fn is_clean_https_url(destination: &str) -> bool {
    let Some(host_and_path) = destination.strip_prefix("https://") else {
        return false;
    };
    let host = host_and_path.split('/').next().unwrap_or_default();
    !host.is_empty() && !host.contains('@') && !host.chars().any(char::is_whitespace)
}

/// Strips `user:password@` from an https destination, stores the password, and
/// returns the URL the network should see.
///
/// Local paths and URLs with no userinfo are returned unchanged. A store
/// failure still returns the redacted URL: the secret must not travel with
/// the request, even if the keychain would not take it.
pub fn take_from_url(destination: &str) -> String {
    let Some((redacted, username, secret)) = split_userinfo(destination) else {
        return destination.to_string();
    };
    // A store failure still returns the redacted URL: the secret must not
    // travel with the request even if the keychain would not take it. But the
    // failure must not be silent — only the error is logged, never the secret.
    if let Err(error) = store(&redacted, &username, &secret) {
        eprintln!("[sync] credential store/erase failed: {error:?}");
    }
    redacted
}

/// Distinguishes "this platform has nowhere to keep a sign-in" from "the store
/// is here and it failed".
///
/// A credential helper that has nothing to offer is supposed to say so and let
/// the request proceed anonymously — that is how a public repository is cloned
/// without a token. Android has no credential store at all, so probing it
/// returns `sync.auth_required`; treating that as a hard error made *public*
/// clones fail on a phone, which is not what anyone means by "sign-in is not
/// available".
///
/// A locked or broken keychain is deliberately *not* included. There the user
/// does have a saved sign-in, and quietly retrying anonymously would turn a
/// fixable "unlock your keychain" into a confusing authentication failure.
fn offer_or_anonymous(
    result: Result<Option<(String, String)>, NativeError>,
) -> Result<Option<(String, String)>, NativeError> {
    match result {
        Err(error) if error.code == "sync.auth_required" => Ok(None),
        other => other,
    }
}

/// What gix calls when a remote asks who we are.
#[allow(clippy::result_large_err)]
pub fn provide(
    action: gix::protocol::credentials::helper::Action,
) -> gix::protocol::credentials::protocol::Result {
    use gix::protocol::credentials::helper::Action;
    match action {
        Action::Get(ctx) => {
            let Some(url) = ctx
                .url
                .as_ref()
                .and_then(|url| std::str::from_utf8(url).ok())
            else {
                return Ok(None);
            };
            let Some((username, password)) = offer_or_anonymous(get(url)).map_err(|source| {
                gix::protocol::credentials::protocol::Error::ConfigureCredentialHelpers {
                    source: Box::new(source),
                }
            })?
            else {
                return Ok(None);
            };
            let mut stored = ctx.clone();
            stored.username = Some(username.clone());
            stored.password = Some(password.clone());
            Ok(Some(gix::protocol::credentials::protocol::Outcome {
                identity: gix::sec::identity::Account {
                    username,
                    password,
                    oauth_refresh_token: None,
                },
                next: stored.into(),
            }))
        }
        Action::Store(payload) => {
            if let Some((url, user, secret)) = identity_from_payload(&payload) {
                // Only the error is logged — never the secret value.
                if let Err(error) = store(&url, &user, &secret) {
                    eprintln!("[sync] credential store/erase failed: {error:?}");
                }
            }
            Ok(None)
        }
        Action::Erase(payload) => {
            if let Some((url, _, _)) = identity_from_payload(&payload) {
                if let Err(error) = delete(&url) {
                    eprintln!("[sync] credential store/erase failed: {error:?}");
                }
            }
            Ok(None)
        }
    }
}

fn account(destination: &str) -> String {
    let clean = split_userinfo(destination)
        .map(|(redacted, _, _)| redacted)
        .unwrap_or_else(|| destination.trim().to_string());
    gix::url::parse(gix::bstr::BStr::new(&clean))
        .ok()
        .and_then(|url| String::from_utf8(url.to_bstring().to_vec()).ok())
        .unwrap_or(clean)
}

/// `https://user:pass@host/path` → redacted URL, user, pass.
///
/// Both userinfo halves are percent-decoded, because git URLs allow encoded
/// characters in credentials (e.g. `https://user:p%40ss@host/path` where the
/// password is `p@ss`). Without decoding, a `@` in the password would be stored
/// verbatim as `%40` and the keychain would hand gix the wrong secret.
fn split_userinfo(destination: &str) -> Option<(String, String, String)> {
    use percent_encoding::percent_decode_str;

    let trimmed = destination.trim();
    let scheme = trimmed.find("://")?;
    if !matches!(&trimmed[..scheme], "http" | "https") {
        return None;
    }
    let rest = &trimmed[scheme + 3..];
    let at = rest.find('@')?;
    let userinfo = &rest[..at];
    if userinfo.is_empty() {
        return None;
    }
    let host = &rest[at + 1..];
    let (username, secret) = match userinfo.split_once(':') {
        Some((user, secret)) => {
            // A decode failure (invalid UTF-8 after percent-decoding) falls
            // back to the raw slice rather than dropping the credential
            // silently: the raw value is what was on the wire.
            let username = percent_decode_str(user)
                .decode_utf8()
                .map(|decoded| decoded.to_string())
                .unwrap_or_else(|_| user.to_string());
            let secret = percent_decode_str(secret)
                .decode_utf8()
                .map(|decoded| decoded.to_string())
                .unwrap_or_else(|_| secret.to_string());
            (username, secret)
        }
        None => {
            let username = percent_decode_str(userinfo)
                .decode_utf8()
                .map(|decoded| decoded.to_string())
                .unwrap_or_else(|_| userinfo.to_string());
            (username, String::new())
        }
    };
    if secret.is_empty() {
        return None;
    }
    Some((format!("{}://{host}", &trimmed[..scheme]), username, secret))
}

fn identity_from_payload(payload: &[u8]) -> Option<(String, String, String)> {
    let text = std::str::from_utf8(payload).ok()?;
    let mut url = None;
    let mut username = None;
    let mut password = None;
    for line in text.lines() {
        if let Some(value) = line.strip_prefix("url=") {
            url = Some(value.to_string());
        } else if let Some(value) = line.strip_prefix("username=") {
            username = Some(value.to_string());
        } else if let Some(value) = line.strip_prefix("password=") {
            password = Some(value.to_string());
        }
    }
    Some((url?, username?, password?))
}

/// Packs a username and secret into one stored payload.
fn encode(username: &str, secret: &str) -> String {
    format!("{username}\n{secret}")
}

fn decode(payload: &str) -> Option<(String, String)> {
    // A malformed entry (no newline, or an empty secret) is indistinguishable
    // from "no credential" by the return value alone, so log it loudly. The
    // payload itself is never logged — it may contain the secret.
    let (username, secret) = payload.split_once('\n').or_else(|| {
        eprintln!("[sync] malformed keychain entry detected");
        None
    })?;
    if secret.is_empty() {
        eprintln!("[sync] malformed keychain entry detected");
        return None;
    }
    Some((username.to_string(), secret.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Registers keyring-core's in-memory store for the whole test binary.
    ///
    /// Under keyring v3 this file carried its own `HashMap` behind
    /// `#[cfg(test)]`, which meant the tested code was not the shipped code.
    /// v4's pluggable store lets the tests exercise the real path and swap only
    /// the backend. The store is process-wide, exactly like the map it
    /// replaces, so tests keep using distinct accounts.
    fn with_a_store() {
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            keyring_core::set_default_store(
                keyring_core::mock::Store::new().expect("mock credential store"),
            );
        });
    }

    #[test]
    fn a_url_with_a_token_is_split_and_the_token_is_not_in_the_result() {
        with_a_store();
        let destination = take_from_url("https://x-access-token:s3cret@example.test/notes.git");

        assert_eq!(destination, "https://example.test/notes.git");
        assert!(!destination.contains("s3cret"));
        let (user, secret) = get(&destination).expect("readable").expect("stored");
        assert_eq!(user, "x-access-token");
        assert_eq!(secret, "s3cret");
    }

    #[test]
    fn a_url_without_a_token_is_left_alone() {
        with_a_store();
        assert_eq!(
            take_from_url("https://clean.example.test/notes.git"),
            "https://clean.example.test/notes.git"
        );
        assert_eq!(
            get("https://clean.example.test/notes.git").expect("readable"),
            None
        );
    }

    #[test]
    fn a_local_path_is_not_treated_as_a_secret() {
        assert_eq!(take_from_url("/tmp/notes.git"), "/tmp/notes.git");
    }

    #[test]
    fn provide_returns_what_was_stored_and_does_not_echo_the_secret_on_miss() {
        with_a_store();
        store("https://example.test/vault.git", "me", "tok").expect("stored");
        let action = gix::protocol::credentials::helper::Action::get_for_url(
            "https://example.test/vault.git",
        );
        let outcome = provide(action)
            .expect("the helper answers")
            .expect("an identity");
        assert_eq!(outcome.identity.username, "me");
        assert_eq!(outcome.identity.password, "tok");

        let miss =
            gix::protocol::credentials::helper::Action::get_for_url("https://other.test/vault.git");
        assert!(provide(miss).expect("a miss is not an error").is_none());
    }

    #[test]
    fn a_bound_profile_does_not_fall_back_to_a_url_entry() {
        with_a_store();
        store(
            "https://fallback.example.test/notes.git",
            "url-user",
            "url-tok",
        )
        .expect("stored");
        store_profile("p-bound", "profile-user", "profile-tok").expect("stored");

        let from_profile = with_profile(Some("p-bound"), || {
            get("https://fallback.example.test/notes.git").expect("readable")
        });
        assert_eq!(
            from_profile,
            Some(("profile-user".to_string(), "profile-tok".to_string()))
        );

        let missing = with_profile(Some("p-missing"), || {
            get("https://fallback.example.test/notes.git").expect("readable")
        });
        assert_eq!(missing, None);
        assert_eq!(
            get_legacy("https://fallback.example.test/notes.git").expect("readable"),
            Some(("url-user".to_string(), "url-tok".to_string()))
        );
    }

    #[test]
    fn two_profiles_for_the_same_host_and_user_stay_distinct() {
        with_a_store();
        store_profile("p-one", "me", "token-one").expect("stored");
        store_profile("p-two", "me", "token-two").expect("stored");

        assert_eq!(
            get_profile("p-one").expect("readable"),
            Some(("me".to_string(), "token-one".to_string()))
        );
        assert_eq!(
            get_profile("p-two").expect("readable"),
            Some(("me".to_string(), "token-two".to_string()))
        );
    }

    #[test]
    fn a_device_with_no_credential_store_offers_no_identity_rather_than_failing() {
        let no_store = NativeError::new(
            "sync.auth_required",
            "Sign-in is not available on this device yet.",
        );

        let offered = offer_or_anonymous(Err(no_store)).expect("no store is not a failure");

        assert_eq!(offered, None);
    }

    #[test]
    fn a_store_that_is_present_but_failing_is_still_an_error() {
        let locked = NativeError::new(
            "sync.credentials_unavailable",
            "Could not use this computer's keychain.",
        );

        let result = offer_or_anonymous(Err(locked));

        assert!(
            result.is_err(),
            "a locked keychain must not fall back to anonymous"
        );
    }

    #[test]
    fn storage_status_treats_a_missing_probe_entry_as_available() {
        with_a_store();
        let (kind, message) = storage_status();
        assert_eq!(kind, StorageKind::Available);
        assert!(message.contains("keep a sign-in"));
    }
}

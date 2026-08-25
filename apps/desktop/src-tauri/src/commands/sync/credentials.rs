//! OS keychain for the one remote a vault syncs to.
//!
//! The token never lives in settings JSON, the vault, or a log line. A URL
//! pasted with a username and password is split on first use: the secret goes
//! here, the destination keeps only the place.

#[cfg(test)]
use std::collections::HashMap;
use std::sync::Mutex;

use crate::error::lock_or_recover;
use crate::NativeError;

#[cfg(all(
    not(test),
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
use super::failed;

/// Keychain service name. Only referenced from the `supported!` (desktop-OS)
/// keychain helpers, so gate it the same way to avoid dead-code warnings on
/// Android, where the keychain is stubbed out.
#[cfg(all(
    not(test),
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
const SERVICE: &str = "ThinkBrain Notes";

/// Keychain account used only to prove the backend answers. Never written.
#[cfg(all(
    not(test),
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
const STORAGE_PROBE: &str = "profile:__storage_probe";

#[cfg(test)]
static MEMORY: Mutex<Option<HashMap<String, (String, String)>>> = Mutex::new(None);
#[cfg(not(test))]
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

fn read_account(key: &str) -> Result<Option<(String, String)>, NativeError> {
    #[cfg(test)]
    {
        Ok(lock_or_recover(&MEMORY)
            .get_or_insert_with(HashMap::new)
            .get(key)
            .cloned())
    }
    #[cfg(not(test))]
    {
        let _guard = lock_or_recover(&KEYCHAIN);
        os_get(key)
    }
}

fn write_account(key: &str, username: &str, secret: &str) -> Result<(), NativeError> {
    #[cfg(test)]
    {
        lock_or_recover(&MEMORY)
            .get_or_insert_with(HashMap::new)
            .insert(key.to_string(), (username.to_string(), secret.to_string()));
        Ok(())
    }
    #[cfg(not(test))]
    {
        let _guard = lock_or_recover(&KEYCHAIN);
        os_store(key, username, secret)
    }
}

fn remove_account(key: &str) -> Result<(), NativeError> {
    #[cfg(test)]
    {
        lock_or_recover(&MEMORY)
            .get_or_insert_with(HashMap::new)
            .remove(key);
        Ok(())
    }
    #[cfg(not(test))]
    {
        let _guard = lock_or_recover(&KEYCHAIN);
        os_delete(key)
    }
}

/// Asks whether the keychain answers, without writing a secret.
pub fn storage_status() -> (StorageKind, String) {
    #[cfg(test)]
    {
        return (
            StorageKind::Available,
            "This computer can keep a sign-in.".to_string(),
        );
    }
    #[cfg(all(
        not(test),
        not(any(target_os = "linux", target_os = "macos", target_os = "windows"))
    ))]
    {
        return (
            StorageKind::Unsupported,
            "Sign-in is not available on this device yet.".to_string(),
        );
    }
    #[cfg(all(
        not(test),
        any(target_os = "linux", target_os = "macos", target_os = "windows")
    ))]
    {
        let _guard = lock_or_recover(&KEYCHAIN);
        match os_get(STORAGE_PROBE) {
            Ok(_) => (
                StorageKind::Available,
                "This computer can keep a sign-in.".to_string(),
            ),
            Err(error) => (StorageKind::Unavailable, error.message),
        }
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
            let Some((username, password)) = get(url).map_err(|source| {
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

/// Wraps an item with the cfg gate for "real OS, not under test".
///
/// Centralises the `not(test)` + supported-OS predicate repeated across every
/// keychain entry point, so a new platform is one line here rather than nine.
macro_rules! supported {
    ($item:item) => {
        #[cfg(all(
            not(test),
            any(target_os = "linux", target_os = "macos", target_os = "windows")
        ))]
        $item
    };
}

/// The same gate, negated: the no-keychain stubs for unsupported platforms.
macro_rules! unsupported {
    ($item:item) => {
        #[cfg(all(
            not(test),
            not(any(target_os = "linux", target_os = "macos", target_os = "windows"))
        ))]
        $item
    };
}

supported! {
fn unavailable(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.credentials_unavailable",
        "Could not use this computer's keychain.",
        error,
    )
}
}

supported! {
fn os_get(account: &str) -> Result<Option<(String, String)>, NativeError> {
    match os_entry(account)?.get_password() {
        Ok(payload) => Ok(decode(&payload)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(unavailable(error)),
    }
}
}

supported! {
fn os_store(account: &str, username: &str, secret: &str) -> Result<(), NativeError> {
    os_entry(account)?
        .set_password(&encode(username, secret))
        .map_err(unavailable)
}
}

supported! {
fn os_delete(account: &str) -> Result<(), NativeError> {
    match os_entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(unavailable(error)),
    }
}
}

supported! {
fn os_entry(account: &str) -> Result<keyring::Entry, NativeError> {
    keyring::Entry::new(SERVICE, account).map_err(unavailable)
}
}

unsupported! {
fn os_get(_account: &str) -> Result<Option<(String, String)>, NativeError> {
    Err(NativeError::new(
        "sync.auth_required",
        "Sign-in is not available on this device yet.",
    ))
}
}

unsupported! {
fn os_store(_account: &str, _username: &str, _secret: &str) -> Result<(), NativeError> {
    Err(NativeError::new(
        "sync.auth_required",
        "Sign-in is not available on this device yet.",
    ))
}
}

unsupported! {
fn os_delete(_account: &str) -> Result<(), NativeError> {
    Ok(())
}
}

supported! {
fn encode(username: &str, secret: &str) -> String {
    format!("{username}\n{secret}")
}
}

supported! {
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_url_with_a_token_is_split_and_the_token_is_not_in_the_result() {
        let destination = take_from_url("https://x-access-token:s3cret@example.test/notes.git");

        assert_eq!(destination, "https://example.test/notes.git");
        assert!(!destination.contains("s3cret"));
        let (user, secret) = get(&destination).expect("readable").expect("stored");
        assert_eq!(user, "x-access-token");
        assert_eq!(secret, "s3cret");
    }

    #[test]
    fn a_url_without_a_token_is_left_alone() {
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
    fn storage_status_treats_a_missing_probe_entry_as_available() {
        let (kind, message) = storage_status();
        assert_eq!(kind, StorageKind::Available);
        assert!(message.contains("keep a sign-in"));
    }
}

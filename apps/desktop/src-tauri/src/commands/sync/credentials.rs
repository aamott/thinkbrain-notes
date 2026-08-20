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

#[cfg(not(test))]
const SERVICE: &str = "ThinkBrain Notes";

#[cfg(test)]
static MEMORY: Mutex<Option<HashMap<String, (String, String)>>> = Mutex::new(None);
#[cfg(not(test))]
static KEYCHAIN: Mutex<()> = Mutex::new(());

/// Username and password for `destination`, if we have one.
pub fn get(destination: &str) -> Result<Option<(String, String)>, NativeError> {
    let key = account(destination);
    #[cfg(test)]
    {
        Ok(lock_or_recover(&MEMORY)
            .get_or_insert_with(HashMap::new)
            .get(&key)
            .cloned())
    }
    #[cfg(not(test))]
    {
        let _guard = lock_or_recover(&KEYCHAIN);
        os_get(&key)
    }
}

/// Stores the identity for `destination`. `secret` is the token; it is not
/// logged, not returned, and not written anywhere but the OS store.
pub fn store(destination: &str, username: &str, secret: &str) -> Result<(), NativeError> {
    let key = account(destination);
    #[cfg(test)]
    {
        lock_or_recover(&MEMORY)
            .get_or_insert_with(HashMap::new)
            .insert(key, (username.to_string(), secret.to_string()));
        Ok(())
    }
    #[cfg(not(test))]
    {
        let _guard = lock_or_recover(&KEYCHAIN);
        os_store(&key, username, secret)
    }
}

fn delete(destination: &str) -> Result<(), NativeError> {
    let key = account(destination);
    #[cfg(test)]
    {
        lock_or_recover(&MEMORY)
            .get_or_insert_with(HashMap::new)
            .remove(&key);
        Ok(())
    }
    #[cfg(not(test))]
    {
        let _guard = lock_or_recover(&KEYCHAIN);
        os_delete(&key)
    }
}

/// Stores credentials entered in the settings form.
///
/// Keeping this separate from [`take_from_url`] means the link setting is
/// always safe to display and export: credentials never need to pass through
/// the settings document at all.
pub fn save_for_destination(
    destination: &str,
    username: &str,
    token: &str,
) -> Result<(), NativeError> {
    let destination = destination.trim();
    let username = username.trim();
    if !is_clean_https_url(destination) {
        return Err(NativeError::new(
            "sync.credentials_need_https",
            "Paste a secret-free HTTPS git link before saving a sign-in.",
        ));
    }
    if username.is_empty() {
        return Err(NativeError::new(
            "sync.credentials_username_missing",
            "Enter the username this token belongs to.",
        ));
    }
    if token.is_empty() {
        return Err(NativeError::new(
            "sync.credentials_token_missing",
            "Enter an access token.",
        ));
    }
    store(destination, username, token)
}

/// Saves a username and access token directly to the OS keychain, then checks
/// the configured destination immediately so a bad sign-in is never deferred
/// behind the idle timer.
#[tauri::command]
pub fn save_sync_credentials(
    app: tauri::AppHandle,
    root_path: String,
    destination: String,
    username: String,
    token: String,
) -> Result<super::round::Synced, NativeError> {
    save_for_destination(&destination, &username, &token)?;
    let root = crate::commands::workspace::resolve_workspace_root(&root_path)?;
    let key = root.to_string_lossy().to_string();
    let engine = super::registry::engine(&key).ok_or_else(|| {
        NativeError::new(
            "sync.not_recording",
            "This folder's history is not being kept, so there is nothing to sync.",
        )
    })?;
    let synced = super::round::sync(&engine, &key, &root, destination.trim())?;
    let synced = super::round::finish(&app, &engine, &key, &root, synced);
    crate::commands::watcher::announce_setup_ok(&app, &key);
    Ok(synced)
}

/// A token form only works for HTTPS, and accepting userinfo here would put a
/// secret back into the URL we deliberately keep secret-free.
fn is_clean_https_url(destination: &str) -> bool {
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
    fn settings_credentials_require_a_clean_https_link_and_go_to_the_keychain() {
        let error = save_for_destination("git@example.test:notes.git", "me", "token")
            .expect_err("SSH does not take an HTTPS token");
        assert_eq!(error.code, "sync.credentials_need_https");

        let error = save_for_destination(
            "https://me:token@settings.example.test/notes.git",
            "me",
            "token",
        )
        .expect_err("a token belongs in the form, not the link");
        assert_eq!(error.code, "sync.credentials_need_https");

        save_for_destination(" https://settings.example.test/notes.git ", " me ", "token")
            .expect("stored");
        assert_eq!(
            get("https://settings.example.test/notes.git").expect("readable"),
            Some(("me".to_string(), "token".to_string()))
        );
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
}

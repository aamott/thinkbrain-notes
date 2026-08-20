//! OS keychain for the one remote a vault syncs to.
//!
//! The token never lives in settings JSON, the vault, or a log line. A URL
//! pasted with a username and password is split on first use: the secret goes
//! here, the destination keeps only the place.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::error::lock_or_recover;
use crate::NativeError;

use super::failed;

#[cfg(not(test))]
const SERVICE: &str = "ThinkBrain Notes";

#[cfg(test)]
static MEMORY: Mutex<Option<HashMap<String, (String, String)>>> = Mutex::new(None);

/// Username and password for `destination`, if we have one.
pub fn get(destination: &str) -> Result<Option<(String, String)>, NativeError> {
    let key = account(destination);
    #[cfg(test)]
    {
        return Ok(lock_or_recover(&MEMORY).get_or_insert_with(HashMap::new).get(&key).cloned());
    }
    #[cfg(not(test))]
    {
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
        return Ok(());
    }
    #[cfg(not(test))]
    {
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
        return Ok(());
    }
    #[cfg(not(test))]
    {
        os_delete(&key)
    }
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
    let _ = store(&redacted, &username, &secret);
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
            let Some(url) = ctx.url.as_ref().and_then(|url| std::str::from_utf8(url).ok()) else {
                return Ok(None);
            };
            let Ok(Some((username, password))) = get(url) else {
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
                let _ = store(&url, &user, &secret);
            }
            Ok(None)
        }
        Action::Erase(payload) => {
            if let Some((url, _, _)) = identity_from_payload(&payload) {
                let _ = delete(&url);
            }
            Ok(None)
        }
    }
}

fn account(destination: &str) -> String {
    split_userinfo(destination)
        .map(|(redacted, _, _)| redacted)
        .unwrap_or_else(|| destination.trim().to_string())
}

/// `https://user:pass@host/path` → redacted URL, user, pass.
fn split_userinfo(destination: &str) -> Option<(String, String, String)> {
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
    let (username, secret) = userinfo
        .split_once(':')
        .map(|(user, secret)| (user.to_string(), secret.to_string()))
        .unwrap_or_else(|| (userinfo.to_string(), String::new()));
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

fn unavailable(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.auth_required",
        "This remote needs a sign-in before it can receive notes.",
        error,
    )
}

#[cfg(all(
    not(test),
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
fn os_get(account: &str) -> Result<Option<(String, String)>, NativeError> {
    match os_entry(account)?.get_password() {
        Ok(payload) => Ok(decode(&payload)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(unavailable(error)),
    }
}

#[cfg(all(
    not(test),
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
fn os_store(account: &str, username: &str, secret: &str) -> Result<(), NativeError> {
    os_entry(account)?
        .set_password(&encode(username, secret))
        .map_err(unavailable)
}

#[cfg(all(
    not(test),
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
fn os_delete(account: &str) -> Result<(), NativeError> {
    match os_entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(unavailable(error)),
    }
}

#[cfg(all(
    not(test),
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
fn os_entry(account: &str) -> Result<keyring::Entry, NativeError> {
    keyring::Entry::new(SERVICE, account).map_err(unavailable)
}

#[cfg(all(
    not(test),
    not(any(target_os = "linux", target_os = "macos", target_os = "windows"))
))]
fn os_get(_account: &str) -> Result<Option<(String, String)>, NativeError> {
    Err(NativeError::new(
        "sync.auth_required",
        "Sign-in is not available on this device yet.",
    ))
}

#[cfg(all(
    not(test),
    not(any(target_os = "linux", target_os = "macos", target_os = "windows"))
))]
fn os_store(_account: &str, _username: &str, _secret: &str) -> Result<(), NativeError> {
    Err(NativeError::new(
        "sync.auth_required",
        "Sign-in is not available on this device yet.",
    ))
}

#[cfg(all(
    not(test),
    not(any(target_os = "linux", target_os = "macos", target_os = "windows"))
))]
fn os_delete(_account: &str) -> Result<(), NativeError> {
    Ok(())
}

#[cfg(all(
    not(test),
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
fn encode(username: &str, secret: &str) -> String {
    format!("{username}\n{secret}")
}

#[cfg(all(
    not(test),
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
fn decode(payload: &str) -> Option<(String, String)> {
    let (username, secret) = payload.split_once('\n')?;
    if secret.is_empty() {
        return None;
    }
    Some((username.to_string(), secret.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_url_with_a_token_is_split_and_the_token_is_not_in_the_result() {
        let destination =
            take_from_url("https://x-access-token:s3cret@example.test/notes.git");

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
        let action = gix::protocol::credentials::helper::Action::get_for_url("https://example.test/vault.git");
        let outcome = provide(action).expect("the helper answers").expect("an identity");
        assert_eq!(outcome.identity.username, "me");
        assert_eq!(outcome.identity.password, "tok");

        let miss = gix::protocol::credentials::helper::Action::get_for_url("https://other.test/vault.git");
        assert!(provide(miss).expect("a miss is not an error").is_none());
    }
}

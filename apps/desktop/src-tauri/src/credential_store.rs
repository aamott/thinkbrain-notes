//! Chooses the credential store this build talks to, once, at startup.
//!
//! keyring v4 split the API (`keyring-core`) from the backends, and moved store
//! selection from a compile-time feature to an explicit registration. That is
//! why this module exists at all: under v3 the choice was made by feature
//! unification in `Cargo.toml` and there was nothing to call.
//!
//! The payoff is that `sync/credentials.rs` has one code path instead of a
//! `supported!` / `unsupported!` pair, and "does this platform have a
//! credential store" becomes a fact we can ask at runtime rather than a `cfg!`
//! we assert at compile time.
//!
//! A platform with no store registered is not an error here. Entry creation
//! then fails with `NoDefaultStore`, which the sync layer reports as
//! `sync.auth_required` — "sign-in is not available on this device yet."

/// Registers the platform credential store as the process default.
///
/// Called once from `run()` before any command can ask for a credential.
/// Registering twice is harmless but pointless; registering late is not, which
/// is why this is not lazy.
pub fn register() {
    match platform_store() {
        Some(Ok(store)) => keyring_core::set_default_store(store),
        Some(Err(error)) => {
            // The platform has a store and it refused to start. Leaving the
            // default unset makes every later call report "no store" rather
            // than pretending a keychain is there, and the reason is logged
            // once here instead of on every credential read.
            eprintln!("[sync] credential store unavailable: {error}");
        }
        // No backend is compiled in for this target (Android today). Nothing to
        // register, and nothing has gone wrong.
        None => {}
    }
}

/// Whether a credential store is available in this process.
///
/// Reports what was actually registered rather than what the target *should*
/// support, so a keychain that failed to start reads as absent instead of
/// present-but-broken.
pub fn is_available() -> bool {
    keyring_core::get_default_store().is_some()
}

#[cfg(target_os = "linux")]
fn platform_store() -> Option<keyring_core::Result<std::sync::Arc<keyring_core::CredentialStore>>> {
    // The Secret Service, because that is where v3 durably kept these secrets.
    // v3's `linux-native-sync-persistent` wrote to keyutils *and* the Secret
    // Service, using the former only as a cache for headless processes; the
    // Secret Service is the half that survives a reboot, so it is the half
    // that carries existing sign-ins forward. Confirmed by reading a v3-written
    // credential back through this store.
    Some(
        dbus_secret_service_keyring_store::Store::new()
            .map(|store| store as std::sync::Arc<keyring_core::CredentialStore>),
    )
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn platform_store() -> Option<keyring_core::Result<std::sync::Arc<keyring_core::CredentialStore>>> {
    Some(
        apple_native_keyring_store::keychain::Store::new()
            .map(|store| store as std::sync::Arc<keyring_core::CredentialStore>),
    )
}

#[cfg(target_os = "windows")]
fn platform_store() -> Option<keyring_core::Result<std::sync::Arc<keyring_core::CredentialStore>>> {
    Some(
        windows_native_keyring_store::Store::new()
            .map(|store| store as std::sync::Arc<keyring_core::CredentialStore>),
    )
}

#[cfg(not(any(
    target_os = "linux",
    target_os = "macos",
    target_os = "ios",
    target_os = "windows"
)))]
fn platform_store() -> Option<keyring_core::Result<std::sync::Arc<keyring_core::CredentialStore>>> {
    // Android reaches here. `android-native-keyring-store` is the intended
    // backend and is tracked separately — it needs a JNI hook of the same shape
    // as `android_tls.rs`, because Tauri does not populate `ndk-context`.
    None
}

//! Does keyring v4 read what keyring v3 wrote, on this platform?
//!
//! That question decides whether upgrading the app silently signs out every
//! existing user, and it cannot be answered by a unit test: the thing under
//! test is the real OS credential store. It also cannot be answered by reading
//! crate names — on Linux the name-matched v4 crate was the wrong one, and
//! guessing would have signed out every Linux user.
//!
//! Usage, in three separate processes:
//!
//! ```text
//! cargo run -- write     # v3 stores a credential
//! cargo run -- verify    # v3 reads it back (control), then v4 reads it
//! cargo run -- clean     # remove it again
//! ```
//!
//! Separate processes matter: a single run could be answered from an
//! in-process cache and prove nothing about what is actually persisted.
//!
//! ## Reading the result on macOS
//!
//! The login keychain binds an item's ACL to the application that created it.
//! Both halves here are the same binary, so the read should be silent. If the
//! OS does prompt for your login password, that is the ACL check, not a
//! migration failure — click Allow and judge the probe by the line it prints
//! afterwards.

/// Matches `SERVICE` in `src-tauri/src/commands/sync/credentials.rs`.
const SERVICE: &str = "ThinkBrain Notes";
/// The app's real account format, with a name no real profile can collide with.
const ACCOUNT: &str = "profile:__migration_probe";
/// The app stores `username\npassword`; keeping that shape exercises the same
/// encoding path rather than a simplified one.
const SECRET: &str = "probeuser\nprobesecret";

fn v3() -> keyring::Entry {
    keyring::Entry::new(SERVICE, ACCOUNT).expect("v3 could not build an entry")
}

/// Registers the same store the app registers, so the probe tests what ships.
fn register_v4_store() {
    #[cfg(target_os = "linux")]
    let store = dbus_secret_service_keyring_store::Store::new();
    #[cfg(target_os = "macos")]
    let store = apple_native_keyring_store::keychain::Store::new();
    #[cfg(target_os = "windows")]
    let store = windows_native_keyring_store::Store::new();

    match store {
        Ok(store) => {
            keyring_core::set_default_store(store as std::sync::Arc<keyring_core::CredentialStore>)
        }
        Err(error) => {
            println!("FAIL - the v4 store would not start at all: {error}");
            std::process::exit(1);
        }
    }
}

fn main() {
    let mode = std::env::args().nth(1).unwrap_or_else(|| "verify".into());

    match mode.as_str() {
        "write" => {
            v3().set_password(SECRET).expect("v3 could not write");
            println!("v3 wrote the probe credential. Now run: cargo run -- verify");
        }

        "verify" => {
            // Control first. Without it, a v4 failure is ambiguous: it could
            // mean v4 reads the wrong place, or simply that nothing was ever
            // stored. This is the check that made the Linux result trustworthy.
            match v3().get_password() {
                Ok(found) if found == SECRET => {
                    println!("[control] v3 read back its own credential. Good.");
                }
                Ok(other) => {
                    println!("[control] v3 read something unexpected: {other:?}");
                    println!("Inconclusive - clean up and start again.");
                    return;
                }
                Err(error) => {
                    println!("[control] v3 could not read its own credential: {error}");
                    println!(
                        "Run `cargo run -- write` first. If you did, then nothing is \
                         persisting here and the probe cannot conclude anything."
                    );
                    return;
                }
            }

            register_v4_store();
            let entry =
                keyring_core::Entry::new(SERVICE, ACCOUNT).expect("v4 could not build an entry");

            match entry.get_password() {
                Ok(found) if found == SECRET => {
                    println!("\nPASS - v4 read the credential v3 wrote.");
                    println!("The migration preserves existing sign-ins on this platform.");
                }
                Ok(other) => {
                    println!("\nFAIL - v4 found an entry but the value differs: {other:?}");
                }
                Err(error) => {
                    println!("\nFAIL - v4 could not read the v3 credential: {error}");
                    println!(
                        "Shipping as-is would silently sign out every existing user on \
                         this platform. Do not release it."
                    );
                }
            }
        }

        "time" => {
            let start = std::time::Instant::now();
            register_v4_store();
            println!("store registration took {:?}", start.elapsed());
            let start = std::time::Instant::now();
            let _ = keyring_core::Entry::new(SERVICE, ACCOUNT).and_then(|e| e.get_password());
            println!("first read took {:?}", start.elapsed());
        }

        "clean" => match v3().delete_credential() {
            Ok(()) => println!("Probe credential removed."),
            Err(error) => println!("Nothing to remove, or removal failed: {error}"),
        },

        other => {
            println!("Unknown mode {other:?}. Expected one of: write, verify, clean.");
        }
    }
}

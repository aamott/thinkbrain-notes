//! Publishes the Android `Context` where crates expect to find it.
//!
//! `ndk-context` is the de-facto place a Rust crate looks for the JavaVM and
//! the app `Context` on Android. Under a normal `android_activity` app the
//! runtime fills it in; under Tauri nothing does — neither `tao` nor `wry`
//! initialise it — so any crate that reads it finds an empty slot and fails.
//!
//! `android-native-keyring-store` is one such crate: every vault operation
//! calls `ndk_context::android_context()`. It ships its own JNI entry point to
//! populate it, but that entry point is named for a Kotlin class of its own
//! (`io.crates.keyring.Keyring`) which this app does not have and should not
//! grow just to satisfy a symbol name. Populating `ndk-context` directly from
//! the `MainActivity` hook we already have is the same work without the extra
//! class.
//!
//! Kept separate from `android_tls.rs` on purpose: that module hands handles to
//! one specific crate, this one publishes them for anybody. They happen to be
//! called from the same place.

use std::ffi::c_void;
use std::sync::OnceLock;

use jni::EnvUnowned;
use jni::errors::ThrowRuntimeExAndDefault;
use jni::objects::{GlobalRef, JObject};

/// Holds the context reference for the life of the process.
///
/// `ndk-context` stores a raw pointer and does not own what it points at, so
/// the global reference behind that pointer has to outlive every use of it —
/// which, for the app `Context`, means forever. Dropping it would leave
/// `ndk-context` handing out a dangling reference.
static CONTEXT: OnceLock<GlobalRef<JObject<'static>>> = OnceLock::new();

/// Publishes the JavaVM and app `Context` through `ndk-context`.
///
/// Called once from `MainActivity.onCreate`. Safe to call twice: the second
/// call finds the `OnceLock` already set and does nothing.
///
/// # Safety
///
/// Invoked by the JVM through JNI with a valid environment pointer and a live
/// `Context`. Not meant to be called from Rust.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_thinkbrain_notes_MainActivity_initNdkContext<'local>(
    mut env: EnvUnowned<'local>,
    _this: JObject<'local>,
    context: JObject<'local>,
) {
    // The error type needs naming: both `jni` and `rustls_platform_verifier`
    // provide a `From<jni::errors::Error>`, so inference has two candidates.
    env.with_env(|env| -> jni::errors::Result<()> {
        if CONTEXT.get().is_some() {
            return Ok(());
        }
        let global = env.new_global_ref(&context)?;
        let vm = env.get_java_vm()?;
        // Set the OnceLock before publishing the pointer, so `ndk-context`
        // can never hand out a reference this process has not yet anchored.
        let anchored = CONTEXT.get_or_init(|| global);
        unsafe {
            ndk_context::initialize_android_context(
                vm.get_raw() as *mut c_void,
                anchored.as_obj().as_raw() as *mut c_void,
            );
        }
        Ok(())
    })
    .resolve::<ThrowRuntimeExAndDefault>();
}

//! Android TLS bootstrap.
//!
//! On Android, `rustls-platform-verifier` validates certificates through the
//! JVM's Android Trust Manager rather than a bundled root store, so it has to
//! be handed a JNI environment and the app `Context` before anything opens a
//! TLS connection. Until that happens, every HTTPS request panics with
//! "Expect rustls-platform-verifier to be initialized" — which is exactly what
//! cloning a repository on a device did before this module existed.
//!
//! Nothing hands it those pointers for us. The usual route, `ndk-context`, is
//! not an option here: neither `tao` nor `wry` initialise it, and the crate is
//! not in the dependency tree at all. So the handles come from Java —
//! `MainActivity.onCreate` calls the native method exported below.
//!
//! Two details worth keeping in mind if this ever needs touching:
//!
//! - The verifier reaches us through `gix-transport -> reqwest`, so this
//!   affects git over HTTPS, public and private repositories alike.
//! - `rustls-platform-verifier` builds against `jni` 0.22 while Tauri's own
//!   Android glue is on 0.21. Both are in the tree; the types here must come
//!   from 0.22 or they will not match `init_with_env`.

use jni::EnvUnowned;
use jni::errors::ThrowRuntimeExAndDefault;
use jni::objects::JObject;

/// Binds `rustls-platform-verifier` to the running JVM.
///
/// Called once from `MainActivity.onCreate`. The crate stores the handles in a
/// `OnceCell`, so repeated calls are harmless.
///
/// # Safety
///
/// Invoked by the JVM through JNI with a valid environment pointer and a live
/// `Context`. Not meant to be called from Rust.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_thinkbrain_notes_MainActivity_initRustlsPlatformVerifier<'local>(
    mut env: EnvUnowned<'local>,
    _this: JObject<'local>,
    context: JObject<'local>,
) {
    env.with_env(|env| rustls_platform_verifier::android::init_with_env(env, context))
        .resolve::<ThrowRuntimeExAndDefault>();
}

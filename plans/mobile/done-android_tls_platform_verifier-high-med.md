# Story: TLS Works on Android — Initialise rustls-platform-verifier

**Status:** 🟩 done · **Urgency:** high · **Difficulty:** med

> Found by running the app, 2026-08-27. See
> `done-device_git_clone_spike-high-easy.md` for the session that turned it
> up. **This gates every network story on Android**, including
> `pending-mobile_git_access-high-hard.md`.

## What happens

Any HTTPS request from Rust on Android panics before it reaches the network:

```
thread 'reqwest-internal-sync-runtime' panicked at
  rustls-platform-verifier-0.7.0/src/android.rs:90:
  Expect rustls-platform-verifier to be initialized
```

Reproduced by attempting to clone `https://github.com/octocat/Hello-World.git`
through "Bring in from Git link…" on a Pixel_7a emulator.

## Why

```
gix-transport → reqwest 0.13.4 → rustls-platform-verifier 0.7.0
tauri 2.11.3  → reqwest 0.13.4 → (same)
```

On Android, `rustls-platform-verifier` validates certificates through the JVM's
Android Trust Manager rather than a bundled root store. That requires a small
Kotlin component in the app's Gradle build and a one-time JNI initialisation
before any networking happens. Neither exists in `gen/android/`, so the crate
panics on first use.

This affects **public and private repositories alike**, which makes it more
fundamental than the credential question the mobile epic treats as the blocker.
It is exactly the class of failure `cargo check -p gix` cannot catch: it
compiles, it links, and it panics at runtime.

## Shape of the fix

Two halves, both required.

**Gradle** — teach the Android project where the crate's bundled Kotlin
component lives and depend on it. Per the crate's Android setup, a repository
resolved through `cargo metadata`:

```gradle
repositories {
    maven {
        url = findRustlsPlatformVerifierProject()
        metadataSources.artifact()
    }
}
dependencies {
    implementation "rustls:rustls-platform-verifier:latest.release"
}
```

`gen/android/` is generated but committed, so this edit persists — and must be
re-applied if the scaffold is ever regenerated. Note that alongside a
`settings.gradle`/`init.gradle` hook.

**Rust** — add `rustls-platform-verifier` as a direct
`cfg(target_os = "android")` dependency and call
`rustls_platform_verifier::android::init_with_env(env, context)` exactly once,
in the mobile entry point (`lib.rs:39`), before anything can make a request.

## The sharp edge: two `jni` versions

`cargo tree --target aarch64-linux-android -i jni` reports **both**:

```
jni@0.21.1   (Tauri / ndk glue)
jni@0.22.4   (rustls-platform-verifier 0.7.0)
```

`init_with_env(&mut Env, JObject)` wants **0.22.4** types, so the init cannot
simply reuse whatever handle Tauri's own Android glue holds — those are 0.21.1
types and will not typecheck against it. Expect to add an explicit
`jni = "0.22"` dependency for Android and construct the pair from raw pointers
(`ndk_context::android_context()` gives `vm()` and `context()` as
`*mut c_void`, which is exactly the shape the crate's own example starts from).

`init_with_refs` and `init_with_runtime` are the other two entry points if
`init_with_env` proves awkward; all three are in
`rustls-platform-verifier-0.7.0/src/android.rs:97,124,152`.

Whether `ndk_context` is populated under Tauri Mobile is still unproven — the
same open question the credential story carries. This story is where it gets
answered.

## Verification

This one cannot be unit-tested — the thing under test is a JVM handshake. It is
verified the way it was found:

1. `pnpm desktop:tauri android build --debug --apk --target x86_64`
2. install on the emulator, `adb logcat -c`
3. clone `https://github.com/octocat/Hello-World.git` via "Bring in from Git
   link…"
4. assert no `rustls-platform-verifier` panic in logcat, and the vault appears
   under `/data/data/com.thinkbrain.notes/vaults/`

## What shipped (2026-08-27, verified on the Pixel_7a emulator)

- `src-tauri/src/android_tls.rs` exports
  `Java_com_thinkbrain_notes_MainActivity_initRustlsPlatformVerifier`, called
  from `MainActivity.onCreate` after `super.onCreate`.
- `rustls-platform-verifier` and `jni = "0.22"` added as
  `cfg(target_os = "android")` dependencies.
- `app/build.gradle.kts` locates the crate's bundled Maven repository through
  `cargo metadata` and depends on the `.aar`.

Two things the crate's own instructions do not mention, both of which cost a
build cycle to find:

- The artifact must be requested as **`@aar`**. `metadataSources { artifact() }`
  skips the POM that declares `<packaging>aar</packaging>`, so Gradle otherwise
  looks for a `.jar` that does not exist.
- **`latest.release` cannot resolve.** The bundled repo ships
  `maven-metadata-local.xml`, not the `maven-metadata.xml` Gradle needs for a
  dynamic version. The version is now read off the directory rather than
  hardcoded, so a cargo update cannot leave the Kotlin half behind the Rust
  half.

**Result:** zero `rustls-platform-verifier` panics, and the clone now proceeds
past TLS to fail at credentials instead — a different, later blocker. Confirmed
by clearing logcat and re-running the same clone that produced the panic.

## Acceptance

- [x] The Kotlin component is wired into `gen/android/`, with a comment saying
      why it must survive scaffold regeneration
- [x] `init_with_env` is called once on the Android entry path before any
      network use
- [x] No `rustls-platform-verifier` panic on an emulator; TLS is reached
- [x] A public repository actually clones — 2026-08-28, once the import stopped
      deleting a vault whose push failed. TLS itself was never the blocker
      after this landed
- [ ] The same clone succeeds on physical hardware — tracked in
      `pending-android_anonymous_clone-high-med.md`, which owns the device pass
- [x] `pnpm qa` green; desktop builds and behaviour unchanged

## Also worth fixing here

When a sync round trip fails for a reason that is not the network, the copy
still says "Check the git link and your connection." That sentence sent this
investigation toward DNS before logcat showed a panic. Consider whether a
non-network native failure should surface as itself rather than as a
connectivity hint.

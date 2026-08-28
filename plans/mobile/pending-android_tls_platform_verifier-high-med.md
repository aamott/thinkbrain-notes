# Story: TLS Works on Android — Initialise rustls-platform-verifier

**Status:** ⬜ pending · **Urgency:** high · **Difficulty:** med

> Found by running the app, 2026-08-27. See
> `pending-device_git_clone_spike-high-easy.md` for the session that turned it
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

## Verification

This one cannot be unit-tested — the thing under test is a JVM handshake. It is
verified the way it was found:

1. `pnpm desktop:tauri android build --debug --apk --target x86_64`
2. install on the emulator, `adb logcat -c`
3. clone `https://github.com/octocat/Hello-World.git` via "Bring in from Git
   link…"
4. assert no `rustls-platform-verifier` panic in logcat, and the vault appears
   under `/data/data/com.thinkbrain.notes/vaults/`

## Acceptance

- [ ] The Kotlin component is wired into `gen/android/`, with a comment saying
      why it must survive scaffold regeneration
- [ ] `init_with_env` is called once on the Android entry path before any
      network use
- [ ] A public repository clones on an emulator with no panic in logcat
- [ ] The same clone succeeds on physical hardware
- [ ] `pnpm qa` green; desktop builds and behaviour unchanged

## Also worth fixing here

When a sync round trip fails for a reason that is not the network, the copy
still says "Check the git link and your connection." That sentence sent this
investigation toward DNS before logcat showed a panic. Consider whether a
non-network native failure should surface as itself rather than as a
connectivity hint.

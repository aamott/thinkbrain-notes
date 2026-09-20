package com.thinkbrain.notes

import android.content.Context
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  /**
   * Wry's default back handler only walks the WebView's *native* session
   * history — `canGoBack()` ignores entries the app pushed via `pushState`,
   * so with it enabled every hardware Back at in-app depth would finish the
   * Activity. Disabled here and replaced by the JS bridge below.
   */
  override val handleBackNavigation: Boolean = false

  /**
   * Hardware Back asks the renderer whether the phone shell's own history has
   * a step left (`window.__thinkbrainHandleAndroidBack`, installed by
   * `usePhoneNavigation`). True means the app consumed the press — an overlay
   * closed or the content route stepped back. False (or no handler, e.g.
   * before the shell mounts) falls through to normal Android behaviour, which
   * keeps root Back exiting/backgrounding the app as users expect.
   *
   * The dispatcher is invoked — not the deprecated `onBackPressed()` — while
   * this callback is disabled, so the fallthrough cannot recurse into itself.
   */
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    val callback = object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript(
          "window.__thinkbrainHandleAndroidBack?.() === true"
        ) { result ->
          if (result != "true") {
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            isEnabled = true
          }
        }
      }
    }
    onBackPressedDispatcher.addCallback(this, callback)
  }

  /**
   * Hands the JVM environment and app Context to `rustls-platform-verifier`.
   *
   * On Android that crate verifies certificates through the Android Trust
   * Manager, so it cannot work until it has these. Without this call every
   * HTTPS request from Rust — including git clone and sync — panics with
   * "Expect rustls-platform-verifier to be initialized".
   *
   * Implemented in `src-tauri/src/android_tls.rs`.
   */
  private external fun initRustlsPlatformVerifier(context: Context)

  /**
   * Publishes the JavaVM and app Context through `ndk-context`.
   *
   * Crates that expect to find them there get nothing under Tauri, which
   * initialises `ndk-context` nowhere. The credential store is one such crate,
   * so without this call saving a sign-in fails on Android.
   *
   * Implemented in `src-tauri/src/android_context.rs`.
   */
  private external fun initNdkContext(context: Context)

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()

    // Order matters here, and it is not the obvious one.
    //
    // `super.onCreate` is what starts the Rust side, and `run()` registers the
    // credential store immediately — whose constructor reads the app Context
    // out of `ndk-context`. So the Context has to be published *before* the
    // call to super, or the app aborts on a panic from deep inside a crate
    // that has no idea Tauri exists.
    //
    // loadLibrary has to come first in turn, so the symbols resolve. It is
    // idempotent, so calling it ahead of the Tauri/Wry setup costs nothing.
    System.loadLibrary("thinkbrain_notes_desktop_lib")
    initNdkContext(applicationContext)

    super.onCreate(savedInstanceState)

    // TLS can wait until after: nothing opens an HTTPS connection during
    // startup, and the verifier is only consulted on the first request.
    initRustlsPlatformVerifier(applicationContext)
  }
}

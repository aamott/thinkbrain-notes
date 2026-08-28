package com.thinkbrain.notes

import android.content.Context
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
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

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // After super.onCreate, so the Tauri/Wry setup has already pulled in the
    // native library. loadLibrary is idempotent, but the ordering is what
    // guarantees the symbol is resolvable here.
    System.loadLibrary("thinkbrain_notes_desktop_lib")
    initRustlsPlatformVerifier(applicationContext)
  }
}

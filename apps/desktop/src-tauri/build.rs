fn main() {
    #[allow(unused_mut)]
    let mut attributes = tauri_build::Attributes::new();

    #[cfg(windows)]
    {
        attributes = attributes.windows_attributes(
            tauri_build::WindowsAttributes::new().window_icon_path("icons/icon.ico"),
        );

        // tauri-build links the Common-Controls v6 manifest into [[bin]]
        // targets via `cargo:rustc-link-arg-bins`, but that flag does NOT
        // apply to the unit-test executable that `cargo test --lib` produces
        // from the lib crate's `#[cfg(test)]` modules. Without the manifest
        // Windows loads comctl32.dll v5, which lacks `TaskDialogIndirect` —
        // a function tao/wry import unconditionally — so the test binary dies
        // with STATUS_ENTRYPOINT_NOT_FOUND (0xC0000139) before main runs.
        //
        // `cargo:rustc-link-arg` applies to every target (bins, cdylib, and
        // the unit-test exe). `/MANIFESTDEPENDENCY` tells the MSVC linker to
        // embed the same SxS dependency in whatever manifest it generates,
        // making Common Controls v6 load for tests too. The flag is a no-op
        // for rlib targets (no linker step) and harmless for the cdylib.
        println!(
            "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:\
             type='win32' \
             name='Microsoft.Windows.Common-Controls' \
             version='6.0.0.0' \
             processorArchitecture='*' \
             publicKeyToken='6595b64144ccf1df' \
             language='*'"
        );
    }

    tauri_build::try_build(attributes).expect("failed to build Tauri desktop shell");
}

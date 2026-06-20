import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@thinkbrain/ui/styles.css",
        replacement: fileURLToPath(
          new URL("../../packages/ui/src/styles/tokens.css", import.meta.url)
        )
      },
      {
        find: "@thinkbrain/core",
        replacement: fileURLToPath(
          new URL("../../packages/core/src/index.ts", import.meta.url)
        )
      },
      {
        find: "@thinkbrain/ui",
        replacement: fileURLToPath(
          new URL("../../packages/ui/src/index.ts", import.meta.url)
        )
      }
    ]
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      // Tauri compiles Rust into src-tauri/target. Letting Vite's file watcher
      // descend into that tree makes it try to watch build artifacts (e.g. the
      // libsqlite3-sys *.o files) while cargo is still writing them, which throws
      // EBUSY on Windows and crashes the dev server. Cargo has its own watcher
      // for the Rust side, so Vite should ignore src-tauri entirely.
      ignored: ["**/src-tauri/**"]
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"]
  }
});

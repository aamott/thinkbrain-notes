import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

/** `fileURLToPath` on Windows produces backslash paths (e.g. `C:\...\src\`).
 *  Vite's alias replacement appends the remaining import path with forward
 *  slashes, creating mixed separators that fail to resolve. Normalizing to
 *  forward slashes keeps aliases working cross-platform. */
const aliasPath = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url)).replace(/\\/g, "/");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@/",
        replacement: aliasPath("./src/")
      },
      {
        find: "@thinkbrain/ui/styles.css",
        replacement: aliasPath("../../packages/ui/src/styles/tokens.css")
      },
      {
        find: "@thinkbrain/core",
        replacement: aliasPath("../../packages/core/src/index.ts")
      },
      {
        find: "@thinkbrain/ui",
        replacement: aliasPath("../../packages/ui/src/index.ts")
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

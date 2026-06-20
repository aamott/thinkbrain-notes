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
    strictPort: true
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"]
  }
});

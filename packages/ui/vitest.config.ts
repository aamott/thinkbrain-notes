import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Per-file `@vitest-environment` pragmas still win; this is the default for
    // component tests, while token tests keep using node.
    environment: "node",
    setupFiles: ["src/test-setup.ts"],
    reporters: process.env.QA_QUIET ? ["dot"] : undefined
  }
});

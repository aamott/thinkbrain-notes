import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Per-file `@vitest-environment` pragmas still win; this is the default for
    // component tests, while token tests keep using node.
    environment: "node"
  }
});

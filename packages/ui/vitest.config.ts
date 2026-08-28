import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Per-file `@vitest-environment` pragmas still win; this is the default for
    // component tests, while token tests keep using node.
    environment: "node",
    setupFiles: ["src/test-setup.ts"],
    // Spread rather than `reporters: undefined`. Vitest 4 reads `.length` off
    // whatever this key holds while resolving config, so an explicit undefined
    // kills startup before a single test runs — which `pnpm qa` never sees,
    // because it always sets QA_QUIET.
    ...(process.env.QA_QUIET ? { reporters: ["dot"] } : {})
  }
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: process.env.QA_QUIET ? ["dot"] : undefined
  }
});

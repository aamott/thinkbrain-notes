import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { ESLint, type Linter } from "eslint";

/**
 * Guards the renderer's Tauri boundary with the real ESLint config rather
 * than a regex the config could drift away from: these fixtures run through
 * `eslint.config.js` exactly as `pnpm lint` runs them.
 */

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

const BOUNDARY_RULES = new Set(["no-restricted-imports", "no-restricted-syntax"]);

async function boundaryMessages(
  filePath: string,
  code: string
): Promise<readonly Linter.LintMessage[]> {
  expect(await eslint.isPathIgnored(filePath)).toBe(false);
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages.filter(
    (message) => message.ruleId !== null && BOUNDARY_RULES.has(message.ruleId)
  );
}

const featureTs = `${repoRoot}apps/desktop/src/feature/fixture.ts`;
const featureTsx = `${repoRoot}apps/desktop/src/feature/fixture.tsx`;
const nativeTs = `${repoRoot}apps/desktop/src/native/fixture.ts`;

describe("the native import boundary", () => {
  it("denies a static scoped-package import in feature code", async () => {
    const messages = await boundaryMessages(
      featureTs,
      'import { invoke } from "@tauri-apps/api/core";\nvoid invoke;\n'
    );
    expect(messages.map((m) => m.ruleId)).toEqual(["no-restricted-imports"]);
  });

  it("denies a scoped subpath import in .tsx feature code", async () => {
    const messages = await boundaryMessages(
      featureTsx,
      'import { listen } from "@tauri-apps/api/event";\nvoid listen;\nexport {};\n'
    );
    expect(messages).toHaveLength(1);
  });

  it("denies a Tauri plugin import", async () => {
    const messages = await boundaryMessages(
      featureTs,
      'import { open } from "@tauri-apps/plugin-dialog";\nvoid open;\n'
    );
    expect(messages).toHaveLength(1);
  });

  it("denies a type-only import", async () => {
    const messages = await boundaryMessages(
      featureTs,
      'import type { UnlistenFn } from "@tauri-apps/api/event";\nconst f: UnlistenFn | null = null;\nvoid f;\n'
    );
    expect(messages).toHaveLength(1);
  });

  it("denies a re-export", async () => {
    const messages = await boundaryMessages(
      featureTs,
      'export { invoke } from "@tauri-apps/api/core";\n'
    );
    expect(messages).toHaveLength(1);
  });

  it("denies a dynamic import", async () => {
    const messages = await boundaryMessages(
      featureTs,
      'export const load = () => import("@tauri-apps/api/core");\n'
    );
    expect(messages.map((m) => m.ruleId)).toEqual(["no-restricted-syntax"]);
  });

  it("denies require()", async () => {
    const messages = await boundaryMessages(
      featureTs,
      'const api = require("@tauri-apps/api/core");\nvoid api;\nexport {};\n'
    );
    expect(messages.map((m) => m.ruleId)).toEqual(["no-restricted-syntax"]);
  });

  it("denies Tauri in main.tsx — the composition root is not exempt", async () => {
    const messages = await boundaryMessages(
      `${repoRoot}apps/desktop/src/main.tsx`,
      'import { isTauri } from "@tauri-apps/api/core";\nvoid isTauri;\n'
    );
    expect(messages).toHaveLength(1);
  });

  it("allows the same import inside native/", async () => {
    const messages = await boundaryMessages(
      nativeTs,
      'import { invoke } from "@tauri-apps/api/core";\nvoid invoke;\n'
    );
    expect(messages).toEqual([]);
  });

  it("allows a dynamic Tauri import inside native/", async () => {
    const messages = await boundaryMessages(
      nativeTs,
      'export const load = () => import("@tauri-apps/plugin-updater");\n'
    );
    expect(messages).toEqual([]);
  });

  it("allows feature code to reach the native adapter", async () => {
    const messages = await boundaryMessages(
      featureTs,
      'import { invokeNativeCommand } from "../native/commands";\nvoid invokeNativeCommand;\n'
    );
    expect(messages).toEqual([]);
  });
});

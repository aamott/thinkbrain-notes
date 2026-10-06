#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const steps = [
  ["Lint", "lint", [], false],
  ["Typecheck", "typecheck", [], false],
  ["Format (Rust)", "format:rust", [], false],
  ["Test (TypeScript)", "test", [], true],
  ["Test (Rust)", "test:rust", ["--quiet"], false]
];
const isWindows = process.platform === "win32";
const pnpmEntry = process.env.npm_execpath;

for (const [label, script, extraArgs, quiet] of steps) {
  console.log(`\n▸ ${label}`);
  const env = { ...process.env, ...(quiet && { QA_QUIET: "1" }) };
  const result = isWindows && pnpmEntry
    ? spawnSync(process.execPath, [pnpmEntry, script, ...extraArgs], { stdio: "inherit", env })
    : isWindows
      ? spawnSync(`pnpm ${script} ${extraArgs.join(" ")}`, { stdio: "inherit", shell: true, env })
      : spawnSync("pnpm", [script, ...extraArgs], { stdio: "inherit", env });
  if (result.error) {
    console.error(`\n✗ ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    const outcome = result.signal ? `signal ${result.signal}` : `exit ${result.status}`;
    console.error(`\n✗ ${label} failed (${outcome}).`);
    process.exit(1);
  }
}

console.log("\n✓ All checks passed.");

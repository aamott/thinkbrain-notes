#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const steps = [
  ["Lint", "lint"],
  ["Typecheck", "typecheck"],
  ["Format (Rust)", "format:rust"],
  ["Test (TypeScript)", "test"],
  ["Test (Rust)", "test:rust"]
];
const isWindows = process.platform === "win32";
const pnpmEntry = process.env.npm_execpath;

for (const [label, script] of steps) {
  console.log(`\n▸ ${label}`);
  const result = isWindows && pnpmEntry
    ? spawnSync(process.execPath, [pnpmEntry, script], { stdio: "inherit" })
    : isWindows
      ? spawnSync(`pnpm ${script}`, { stdio: "inherit", shell: true })
      : spawnSync("pnpm", [script], { stdio: "inherit" });
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

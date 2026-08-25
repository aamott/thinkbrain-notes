#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("with-rust-env: missing command to run");
  console.error("usage: node scripts/with-rust-env.mjs <command> [args...]");
  process.exit(2);
}

const isWindows = process.platform === "win32";
const here = dirname(fileURLToPath(import.meta.url));
const bashWrapper = join(here, "with-rust-env.sh");
const hasCommand = (command) => {
  const result = isWindows
    ? spawnSync("where.exe", [command], { stdio: "ignore" })
    : spawnSync("sh", ["-c", "command -v \"$1\"", "sh", command], { stdio: "ignore" });
  return result.status === 0;
};

if (!isWindows && existsSync(bashWrapper) && hasCommand("bash")) {
  const result = spawnSync("bash", [bashWrapper, ...args], { stdio: "inherit" });
  if (result.error) console.error(`with-rust-env: ${result.error.message}`);
  process.exit(result.status ?? 1);
}

const env = { ...process.env };
if (hasCommand("sccache")) env.RUSTC_WRAPPER = "sccache";
else delete env.RUSTC_WRAPPER;

let [command, ...commandArgs] = args;
if (isWindows && command === "pnpm") {
  if (!process.env.npm_execpath) {
    console.error("with-rust-env: run pnpm commands through a package script on Windows");
    process.exit(2);
  }
  command = process.execPath;
  commandArgs = [process.env.npm_execpath, ...commandArgs];
}

const result = spawnSync(command, commandArgs, { stdio: "inherit", env });
if (result.error) console.error(`with-rust-env: ${result.error.message}`);
process.exit(result.status ?? 1);

#!/usr/bin/env node
/**
 * @fileoverview Sync the release version across every manifest that carries it.
 *
 * Why: the app version used to be written literally in tauri.conf.json while
 * package.json files and Cargo.toml drifted. Now `apps/desktop/package.json`
 * is the single source of truth and tauri.conf.json reads it via Tauri v2's
 * `"version": "../package.json"` path form. This script keeps the remaining
 * manifests (workspace package.json files, Cargo.toml, Cargo.lock) in line;
 * `--check` lets `pnpm qa` and CI fail on drift or on a tag that does not
 * match the version being released.
 *
 * Usage:
 *   node scripts/version.mjs <version>            set the version everywhere
 *   node scripts/version.mjs --check [--tag REF]  verify sync; REF (sans
 *                                                 leading v) must match too
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const TAURI_CONF = "apps/desktop/src-tauri/tauri.conf.json";
const TAURI_VERSION_PATH = "../package.json"; // resolves to apps/desktop/package.json
const SOURCE = "apps/desktop/package.json";
const PKGS = [SOURCE, "package.json", "packages/core/package.json", "packages/ui/package.json"];
const CARGO_TOML = "apps/desktop/src-tauri/Cargo.toml";
const LOCK_CANDIDATES = ["apps/desktop/src-tauri/Cargo.lock", "Cargo.lock"];
const CRATE = "thinkbrain-notes-desktop";

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };
const read = (rel) => {
  if (!existsSync(join(ROOT, rel))) fail(`${rel}: file not found`);
  return readFileSync(join(ROOT, rel), "utf8");
};
const write = (rel, s) => { writeFileSync(join(ROOT, rel), s); console.log(`✓ ${rel} updated`); };
const jsonVersion = (rel) => {
  try { return JSON.parse(read(rel)).version; }
  catch (e) { fail(`${rel}: ${e.message}`); }
};

/** Returns the `version = "x"` inside Cargo.toml's [package] table only. */
const cargoVersion = () => {
  let inPkg = false;
  for (const line of read(CARGO_TOML).split("\n")) {
    const t = line.trim();
    if (t.startsWith("[")) inPkg = t === "[package]";
    else if (inPkg && /^version\s*=/.test(t)) {
      const m = t.match(/"([^"]+)"/);
      return m ? m[1] : fail(`${CARGO_TOML}: cannot parse [package] version`);
    }
  }
  fail(`${CARGO_TOML}: no version inside [package] table`);
};

/** Rewrites the `version` line inside [package]; leaves other tables alone. */
const writeCargoToml = (v) => {
  let inPkg = false, done = false;
  const out = read(CARGO_TOML).split("\n").map((line) => {
    const t = line.trim();
    if (t.startsWith("[")) inPkg = t === "[package]";
    else if (inPkg && !done && /^version\s*=/.test(t)) {
      done = true;
      return line.replace(/"[^"]*"/, `"${v}"`);
    }
    return line;
  });
  if (!done) fail(`${CARGO_TOML}: no version inside [package] table`);
  write(CARGO_TOML, out.join("\n"));
};

/** Locates the Cargo.lock that locks CRATE (lives in src-tauri, not repo root). */
const findLock = () => {
  for (const rel of LOCK_CANDIDATES)
    if (existsSync(join(ROOT, rel)) && read(rel).includes(`name = "${CRATE}"`)) return rel;
  fail(`Cargo.lock: no file among [${LOCK_CANDIDATES.join(", ")}] contains "${CRATE}"`);
};

/** Returns {lines, i} where i is the `version` line under `name = "CRATE"`. */
const lockVersionLine = (rel) => {
  const lines = read(rel).split("\n");
  const i = lines.findIndex((l) => l.trim() === `name = "${CRATE}"`);
  if (i === -1) fail(`${rel}: no package "${CRATE}"`);
  if (!/^\s*version\s*=\s*"[^"]*"/.test(lines[i + 1] ?? ""))
    fail(`${rel}: no version line after name = "${CRATE}"`);
  return { lines, i: i + 1 };
};

const check = (tag) => {
  const v = jsonVersion(SOURCE);
  const bad = [];
  const tv = jsonVersion(TAURI_CONF);
  if (tv !== TAURI_VERSION_PATH)
    bad.push(`${TAURI_CONF}: version is "${tv}", expected "${TAURI_VERSION_PATH}"`);
  for (const rel of PKGS.slice(1)) {
    const got = jsonVersion(rel);
    if (got !== v) bad.push(`${rel}: version is "${got}", expected "${v}"`);
  }
  const cv = cargoVersion();
  if (cv !== v) bad.push(`${CARGO_TOML}: version is "${cv}", expected "${v}"`);
  const lock = findLock();
  const { lines, i } = lockVersionLine(lock);
  const lv = lines[i].match(/"([^"]+)"/)[1];
  if (lv !== v) bad.push(`${lock}: version is "${lv}", expected "${v}"`);
  if (tag !== undefined) {
    const stripped = tag.replace(/^v/, "");
    if (stripped !== v) bad.push(`tag "${tag}" → "${stripped}", expected "${v}"`);
  }
  if (bad.length) fail(`version drift:\n  ${bad.join("\n  ")}`);
  console.log(`✓ all manifests agree on ${v}${tag ? ` (tag ${tag} ok)` : ""}`);
};

const set = (v) => {
  if (!SEMVER.test(v)) fail(`"${v}" is not semver (want X.Y.Z[-prerelease])`);
  const tv = jsonVersion(TAURI_CONF);
  if (tv !== TAURI_VERSION_PATH)
    fail(`${TAURI_CONF}: version is "${tv}", expected "${TAURI_VERSION_PATH}" — fix it first`);
  for (const rel of PKGS) {
    const json = JSON.parse(read(rel));
    json.version = v;
    write(rel, JSON.stringify(json, null, 2) + "\n");
  }
  writeCargoToml(v);
  const lock = findLock();
  const { lines, i } = lockVersionLine(lock);
  lines[i] = lines[i].replace(/"[^"]*"/, `"${v}"`);
  write(lock, lines.join("\n"));
  const cl = join(ROOT, "CHANGELOG.md");
  const has = existsSync(cl) &&
    readFileSync(cl, "utf8").split("\n").some((l) => l.startsWith(`## ${v} `));
  if (!has)
    console.warn(`⚠ CHANGELOG.md has no "## ${v} " heading — write release notes before tagging.`);
  console.log([
    "",
    "Next steps (run yourself — this script never touches git):",
    `  git add ${[...PKGS, TAURI_CONF, CARGO_TOML, lock].join(" ")}`,
    `  git commit -m "chore(release): ${v}"`,
    `  git tag -a v${v} -m "ThinkBrain Notes v${v}"`,
    "  git push && git push --tags"
  ].join("\n"));
};

const args = process.argv.slice(2);
if (args[0] === "--check") {
  const ti = args.indexOf("--tag");
  if (ti !== -1 && !args[ti + 1]) fail("--tag requires a ref");
  check(ti === -1 ? undefined : args[ti + 1]);
} else if (args.length === 1) set(args[0]);
else fail("usage: node scripts/version.mjs <version> | --check [--tag <ref>]");

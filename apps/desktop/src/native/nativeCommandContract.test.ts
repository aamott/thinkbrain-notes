import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import * as ts from "typescript";

/**
 * Command-name parity guard between the Rust `app_command_list!` registry and
 * the handwritten `NativeCommandMap` interface in `./commands.ts`. It proves
 * the two name lists are identical — argument/result type drift remains a
 * runtime concern until the map is generated. See the `command_map_contract_check`
 * task under `plans/other_tasks/`.
 *
 * Each extractor is a deliberately small parser for one constrained shape, not
 * generic language tooling: anything it cannot read fails loudly rather than
 * passing silently.
 */

// --- Rust side: `app_command_list!`'s `$crate::$expand! { path::to::cmd, ... }` body.

const EXPAND_HEAD = "$crate::$expand!";
/** A module-qualified Rust identifier path: at least two `ident` segments. */
const COMMAND_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)+$/;

/**
 * Index just past the comment starting at `at`, or -1 when none starts there.
 * Rust block comments nest; line comments run to (and keep) the newline.
 */
function skipRustComment(source: string, at: number): number {
  if (source.startsWith("//", at)) {
    const newline = source.indexOf("\n", at);
    return newline === -1 ? source.length : newline;
  }
  if (!source.startsWith("/*", at)) return -1;
  let depth = 1;
  let i = at + 2;
  while (i < source.length && depth > 0) {
    if (source.startsWith("/*", i)) {
      depth += 1;
      i += 2;
    } else if (source.startsWith("*/", i)) {
      depth -= 1;
      i += 2;
    } else {
      i += 1;
    }
  }
  if (depth !== 0) throw new Error("unterminated block comment in app_command_list!");
  return i;
}

/** Raw text inside the balanced `{ ... }` block that opens at `openBrace`. */
function extractBracedBody(source: string, openBrace: number): string {
  let depth = 0;
  let i = openBrace;
  while (i < source.length) {
    const commentEnd = skipRustComment(source, i);
    if (commentEnd !== -1) {
      i = commentEnd;
      continue;
    }
    const char = source.charAt(i);
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openBrace + 1, i);
    }
    i += 1;
  }
  throw new Error("app_command_list! has an unterminated `{ ... }` body");
}

function stripRustComments(source: string): string {
  let stripped = "";
  let i = 0;
  while (i < source.length) {
    const commentEnd = skipRustComment(source, i);
    if (commentEnd === -1) {
      stripped += source.charAt(i);
      i += 1;
    } else {
      i = commentEnd;
    }
  }
  return stripped;
}

/**
 * Index of the `{` directly following `head` (only whitespace allowed between
 * them), or -1 when anything else stands in the way — a stray `{` further
 * along can never satisfy the check.
 */
function headBraceIndex(source: string, headIndex: number, head: string): number {
  const brace = source.indexOf("{", headIndex);
  const spanEnd = brace === -1 ? source.length : brace + 1;
  const prefix = source.slice(headIndex, spanEnd);
  const pattern = head
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`^${pattern}\\s*\\{$`).test(prefix) ? brace : -1;
}

/** Final `::` segment of every command path inside `macro_rules! app_command_list`. */
function extractRustCommandNames(source: string): string[] {
  // Comments go first so a commented-out macro can never match.
  const stripped = stripRustComments(source);
  const macros = [...stripped.matchAll(/macro_rules!\s+app_command_list\b/g)];
  const [macro, secondMacro] = macros;
  if (!macro || secondMacro) {
    throw new Error(
      `commands/mod.rs must define exactly one macro_rules! app_command_list (found ${macros.length})`
    );
  }
  // Bound the search to this macro's own `{ ... }` body so a `$crate::$expand!`
  // inside a later, unrelated macro can never satisfy the lookup.
  const macroBrace = headBraceIndex(stripped, macro.index, "macro_rules! app_command_list");
  if (macroBrace === -1) {
    throw new Error("macro_rules! app_command_list is not followed by a `{ ... }` body");
  }
  const macroBody = extractBracedBody(stripped, macroBrace);
  const expand = macroBody.indexOf(EXPAND_HEAD);
  if (expand === -1) {
    throw new Error("app_command_list! never expands through `$crate::$expand!`");
  }
  const listBrace = headBraceIndex(macroBody, expand, EXPAND_HEAD);
  if (listBrace === -1) {
    throw new Error("`$crate::$expand!` is not followed by a `{ ... }` body");
  }
  const entries = extractBracedBody(macroBody, listBrace)
    .split(",")
    .map((entry) => entry.trim());
  if (entries.at(-1) === "") entries.pop(); // at most one trailing comma is allowed
  if (entries.length === 0) throw new Error("app_command_list! expands to an empty command list");
  const names: string[] = [];
  for (const entry of entries) {
    if (!COMMAND_PATH.test(entry)) {
      throw new Error(`malformed app_command_list! entry: ${JSON.stringify(entry)}`);
    }
    const name = entry.slice(entry.lastIndexOf("::") + 2);
    if (names.includes(name)) {
      throw new Error(`app_command_list! names ${JSON.stringify(name)} more than once`);
    }
    names.push(name);
  }
  return names;
}

// --- TypeScript side: direct member names of the one `NativeCommandMap` interface.

/** Direct member names of the single top-level `NativeCommandMap` interface. */
function extractTsCommandNames(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    "commands.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  // createSourceFile is error-tolerant by design: syntax errors land on
  // `parseDiagnostics` (absent from the public SourceFile type) instead of
  // throwing, so they must be surfaced by hand.
  const { parseDiagnostics = [] } = sourceFile as ts.SourceFile & {
    parseDiagnostics?: readonly ts.Diagnostic[];
  };
  const [firstError] = parseDiagnostics;
  if (firstError) {
    throw new Error(
      `commands.ts does not parse cleanly: ${ts.flattenDiagnosticMessageText(firstError.messageText, "\n")}`
    );
  }
  const maps = sourceFile.statements.filter(
    (node): node is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(node) && node.name.text === "NativeCommandMap"
  );
  const [commandMap, secondMap] = maps;
  if (!commandMap || secondMap) {
    throw new Error(
      `commands.ts must define exactly one interface NativeCommandMap (found ${maps.length})`
    );
  }
  // `commandMap.members` holds only the interface's own members. The `args`
  // and `result` shapes inside each entry are nested type literals, so their
  // keys never reach this list.
  const names: string[] = [];
  for (const member of commandMap.members) {
    if (!ts.isPropertySignature(member)) {
      throw new Error(
        `NativeCommandMap member uses unsupported syntax kind ${ts.SyntaxKind[member.kind] ?? member.kind}`
      );
    }
    const name = member.name;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
      names.push(name.text);
    } else {
      throw new Error(
        `NativeCommandMap member has unsupported name kind ${ts.SyntaxKind[name.kind] ?? name.kind}`
      );
    }
  }
  if (names.length === 0) throw new Error("NativeCommandMap declares no members");
  return names;
}

describe("extractTsCommandNames", () => {
  it("collects direct members only, including string-literal names", () => {
    const names = extractTsCommandNames(`
      interface Unrelated { readonly args: string }
      interface NativeCommandMap {
        readonly first_command: {
          readonly args: { readonly limit: number };
          readonly result: string;
        };
        readonly "second_command": { readonly args: undefined; readonly result: null };
      }
    `);
    expect(names).toEqual(["first_command", "second_command"]);
  });

  it("fails when the interface is absent or unparseable", () => {
    expect(() => extractTsCommandNames("interface Other {}")).toThrow(/NativeCommandMap/);
    expect(() => extractTsCommandNames("interface NativeCommandMap {")).toThrow(/parse/);
  });

  it("fails on unsupported member syntax", () => {
    expect(() => extractTsCommandNames("interface NativeCommandMap { run(): void }")).toThrow(
      /unsupported/
    );
    expect(() =>
      extractTsCommandNames("interface NativeCommandMap { [key: string]: unknown }")
    ).toThrow(/unsupported/);
  });
});

describe("extractRustCommandNames", () => {
  it("collects final path segments across nested modules, comments, and a trailing comma", () => {
    const names = extractRustCommandNames(`
      macro_rules! app_command_list {
          ($expand:ident) => {
              $crate::$expand! {
              workspace::open_workspace, // a comment with :: and { braces, commas }
              /* a block { comment } */ sync::history::sync_history,
              sync::resolve::list_conflicts,
              }
          };
      }
    `);
    expect(names).toEqual(["open_workspace", "sync_history", "list_conflicts"]);
  });

  it("ignores commented-out macro definitions entirely", () => {
    const names = extractRustCommandNames(`
      // macro_rules! app_command_list {
      //     ($e:ident) => { $crate::$expand! { fake::line_commented } }
      // }
      /* macro_rules! app_command_list {
           ($e:ident) => { $crate::$expand! { fake::block_commented } }
         } */
      macro_rules! app_command_list {
          ($expand:ident) => { $crate::$expand! { real::live_command } }
      }
    `);
    expect(names).toEqual(["live_command"]);
  });

  it("never borrows `$crate::$expand!` from a later, unrelated macro", () => {
    expect(() =>
      extractRustCommandNames(`
        macro_rules! app_command_list {
            ($e:ident) => { $crate::other_expand! { a::cmd } }
        }
        macro_rules! something_else {
            () => { $crate::$expand! { b::cmd } }
        }
      `)
    ).toThrow(/never expands/);
  });

  it("fails when the macro is absent, duplicated, or lists nothing", () => {
    expect(() => extractRustCommandNames("pub mod workspace;")).toThrow(/app_command_list/);
    expect(() =>
      extractRustCommandNames(`
        macro_rules! app_command_list { ($e:ident) => { $crate::$expand! { a::x } } }
        macro_rules! app_command_list { ($e:ident) => { $crate::$expand! { b::y } } }
      `)
    ).toThrow(/exactly one/);
    expect(() =>
      extractRustCommandNames(
        "macro_rules! app_command_list { ($e:ident) => { $crate::$expand! {} } }"
      )
    ).toThrow(/empty/);
  });

  it("fails on malformed entries, including repeated trailing commas", () => {
    const malformed = (list: string) =>
      `macro_rules! app_command_list { ($e:ident) => { $crate::$expand! { ${list} } } }`;
    expect(() => extractRustCommandNames(malformed("bare_name,"))).toThrow(/malformed/);
    expect(() => extractRustCommandNames(malformed("a::b,, c::d,"))).toThrow(/malformed/);
    expect(() => extractRustCommandNames(malformed("a::b,,"))).toThrow(/malformed/);
  });

  it("fails when a command name is listed twice", () => {
    expect(() =>
      extractRustCommandNames(
        "macro_rules! app_command_list { ($e:ident) => { $crate::$expand! { a::same_name, b::same_name, } } }"
      )
    ).toThrow(/more than once/);
  });
});

describe("native command contract", () => {
  it("registers every app_command_list! entry in NativeCommandMap and vice versa", () => {
    const tsNames = extractTsCommandNames(
      readFileSync(new URL("./commands.ts", import.meta.url), "utf8")
    ).sort();
    const rustNames = extractRustCommandNames(
      readFileSync(new URL("../../src-tauri/src/commands/mod.rs", import.meta.url), "utf8")
    ).sort();

    const missingFromTs = rustNames.filter((name) => !tsNames.includes(name));
    const missingFromRust = tsNames.filter((name) => !rustNames.includes(name));
    expect(
      missingFromTs,
      `Rust registers commands with no NativeCommandMap entry: ${missingFromTs.join(", ")}`
    ).toEqual([]);
    expect(
      missingFromRust,
      `NativeCommandMap keys with no registered Rust command: ${missingFromRust.join(", ")}`
    ).toEqual([]);
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  KNOWN_THEME_TOKENS,
  parseThemeFile,
  serializeThemeFile,
  type ThemeFile
} from "./theme";

/** A minimal but fully-valid theme JSON string. */
const VALID_THEME_JSON = JSON.stringify({
  name: "Forest",
  base: "dark",
  version: 1,
  tokens: {
    "--tn-color-background": "hsl(0 0% 7%)",
    "--tn-color-foreground": "hsl(0 0% 98%)"
  }
});

/** Builds a theme JSON string from a partial object merged over valid defaults. */
function buildJson(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    name: "Forest",
    base: "dark",
    version: 1,
    tokens: {},
    ...overrides
  });
}

describe("parseThemeFile - valid input", () => {
  it("returns the theme with no diagnostics when all fields are valid", () => {
    const result = parseThemeFile(VALID_THEME_JSON);

    expect(result.diagnostics).toEqual([]);
    expect(result.theme).not.toBeNull();
    expect(result.theme!.name).toBe("Forest");
    expect(result.theme!.base).toBe("dark");
    expect(result.theme!.version).toBe(1);
    expect(result.theme!.tokens).toEqual({
      "--tn-color-background": "hsl(0 0% 7%)",
      "--tn-color-foreground": "hsl(0 0% 98%)"
    });
  });

  it("returns an empty tokens map when tokens are omitted", () => {
    const result = parseThemeFile(
      JSON.stringify({ name: "Minimal", base: "light", version: 0 })
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.theme).not.toBeNull();
    expect(result.theme!.tokens).toEqual({});
  });

  it("defaults version to the current schema version when omitted, with no diagnostics", () => {
    const result = parseThemeFile(
      JSON.stringify({ name: "No Version", base: "light" })
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.theme).not.toBeNull();
    expect(result.theme!.version).toBe(1);
  });

  it("returns only the tokens that were overridden", () => {
    const result = parseThemeFile(
      JSON.stringify({
        name: "Partial",
        base: "light",
        version: 2,
        tokens: {
          "--tn-color-primary": "hsl(262 83% 58%)"
        }
      })
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.theme!.tokens).toEqual({
      "--tn-color-primary": "hsl(262 83% 58%)"
    });
  });

  it("trims whitespace from the name", () => {
    const result = parseThemeFile(
      JSON.stringify({ name: "  Spaced  ", base: "dark", version: 1 })
    );
    expect(result.theme!.name).toBe("Spaced");
  });
});

describe("parseThemeFile - structural failures (theme is null)", () => {
  it("returns null theme + error diagnostic for invalid JSON", () => {
    const result = parseThemeFile("{ not valid json");

    expect(result.theme).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("theme.invalid_json");
    expect(result.diagnostics[0]!.severity).toBe("error");
  });

  it("returns null theme + error diagnostic for a JSON array", () => {
    const result = parseThemeFile("[]");
    expect(result.theme).toBeNull();
    expect(result.diagnostics[0]!.code).toBe("theme.invalid_shape");
  });

  it("returns null theme + error diagnostic for a JSON string", () => {
    const result = parseThemeFile('"hello"');
    expect(result.theme).toBeNull();
    expect(result.diagnostics[0]!.code).toBe("theme.invalid_shape");
  });

  it("returns null theme + error diagnostic for a JSON number", () => {
    const result = parseThemeFile("42");
    expect(result.theme).toBeNull();
    expect(result.diagnostics[0]!.code).toBe("theme.invalid_shape");
  });

  it("returns null theme when name is missing", () => {
    const result = parseThemeFile(buildJson({ name: undefined }));
    expect(result.theme).toBeNull();
    expect(result.diagnostics[0]!.code).toBe("theme.name.missing");
    expect(result.diagnostics[0]!.path).toBe("name");
  });

  it("returns null theme when name is not a string", () => {
    const result = parseThemeFile(buildJson({ name: 42 }));
    expect(result.theme).toBeNull();
    expect(result.diagnostics[0]!.code).toBe("theme.name.missing");
  });

  it("returns null theme when name is empty/whitespace", () => {
    const result = parseThemeFile(buildJson({ name: "   " }));
    expect(result.theme).toBeNull();
    expect(result.diagnostics[0]!.code).toBe("theme.name.missing");
  });

  it("returns null theme when base is missing", () => {
    const result = parseThemeFile(buildJson({ base: undefined }));
    expect(result.theme).toBeNull();
    expect(result.diagnostics[0]!.code).toBe("theme.base.invalid");
    expect(result.diagnostics[0]!.path).toBe("base");
  });

  it("returns null theme when base is 'system'", () => {
    const result = parseThemeFile(buildJson({ base: "system" }));
    expect(result.theme).toBeNull();
    expect(result.diagnostics[0]!.code).toBe("theme.base.invalid");
  });

  it("returns null theme when base is an unknown string", () => {
    const result = parseThemeFile(buildJson({ base: "neon" }));
    expect(result.theme).toBeNull();
    expect(result.diagnostics[0]!.code).toBe("theme.base.invalid");
  });

  it("returns null theme when version is negative", () => {
    const result = parseThemeFile(buildJson({ version: -1 }));
    expect(result.theme).toBeNull();
    expect(result.diagnostics[0]!.code).toBe("theme.version.invalid");
  });

  it("returns null theme when version is a non-integer number", () => {
    const result = parseThemeFile(buildJson({ version: 1.5 }));
    expect(result.theme).toBeNull();
    expect(result.diagnostics[0]!.code).toBe("theme.version.invalid");
  });

  it("returns null theme when version is not a number", () => {
    const result = parseThemeFile(buildJson({ version: "1" }));
    expect(result.theme).toBeNull();
    expect(result.diagnostics[0]!.code).toBe("theme.version.invalid");
  });
});

describe("parseThemeFile - token-level diagnostics (theme still returned)", () => {
  it("warns and drops a --tn-* token that is not in the known list", () => {
    const result = parseThemeFile(
      buildJson({
        tokens: {
          "--tn-color-background": "hsl(0 0% 7%)",
          "--tn-color-future-token": "hsl(0 0% 50%)"
        }
      })
    );

    expect(result.theme).not.toBeNull();
    expect(result.theme!.tokens).toEqual({
      "--tn-color-background": "hsl(0 0% 7%)"
    });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("theme.token.unknown");
    expect(result.diagnostics[0]!.severity).toBe("warning");
    expect(result.diagnostics[0]!.path).toBe("tokens.--tn-color-future-token");
  });

  it("errors and drops a token key that does not start with --tn-", () => {
    const result = parseThemeFile(
      buildJson({
        tokens: {
          "color-background": "hsl(0 0% 7%)",
          "--tn-color-foreground": "hsl(0 0% 98%)"
        }
      })
    );

    expect(result.theme).not.toBeNull();
    expect(result.theme!.tokens).toEqual({
      "--tn-color-foreground": "hsl(0 0% 98%)"
    });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("theme.token.unknown_namespace");
    expect(result.diagnostics[0]!.severity).toBe("error");
    expect(result.diagnostics[0]!.path).toBe("tokens.color-background");
  });

  it("errors and drops a token whose value is not a string", () => {
    const result = parseThemeFile(
      buildJson({
        tokens: {
          "--tn-color-background": 42,
          "--tn-color-foreground": "hsl(0 0% 98%)"
        }
      })
    );

    expect(result.theme!.tokens).toEqual({
      "--tn-color-foreground": "hsl(0 0% 98%)"
    });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("theme.token.value_not_string");
    expect(result.diagnostics[0]!.severity).toBe("error");
  });

  it("errors and drops a token whose value is an empty string", () => {
    const result = parseThemeFile(
      buildJson({
        tokens: {
          "--tn-color-background": "",
          "--tn-color-foreground": "hsl(0 0% 98%)"
        }
      })
    );

    expect(result.theme!.tokens).toEqual({
      "--tn-color-foreground": "hsl(0 0% 98%)"
    });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("theme.token.value_empty");
    expect(result.diagnostics[0]!.severity).toBe("error");
  });

  it("errors when tokens is present but not an object", () => {
    const result = parseThemeFile(buildJson({ tokens: "not-an-object" }));

    expect(result.theme).not.toBeNull();
    expect(result.theme!.tokens).toEqual({});
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("theme.tokens.invalid_shape");
    expect(result.diagnostics[0]!.severity).toBe("error");
    expect(result.diagnostics[0]!.path).toBe("tokens");
  });

  it("collects multiple diagnostics from a mixed bag of bad tokens", () => {
    const result = parseThemeFile(
      buildJson({
        tokens: {
          "bad-key": "x",
          "--tn-color-future": "y",
          "--tn-color-background": 5,
          "--tn-color-foreground": ""
        }
      })
    );

    expect(result.theme!.tokens).toEqual({});
    expect(result.diagnostics.map((d) => d.code).sort()).toEqual([
      "theme.token.unknown",
      "theme.token.unknown_namespace",
      "theme.token.value_empty",
      "theme.token.value_not_string"
    ]);
  });
});

describe("parseThemeFile - CSS-injection-unsafe token values", () => {
  it.each([
    ["semicolon breakout", "red; } * { color: red"],
    ["brace breakout", "red } .evil { color: red"],
    ["open brace", "red { color: red"],
    ["at-rule injection", "red; @import url(evil.css)"],
    ["comment sequence", "red /* } .evil {"]
  ])("errors and drops a value containing a %s", (_label, value) => {
    const result = parseThemeFile(
      buildJson({
        tokens: {
          "--tn-color-background": value,
          "--tn-color-foreground": "hsl(0 0% 98%)"
        }
      })
    );

    expect(result.theme).not.toBeNull();
    expect(result.theme!.tokens).toEqual({
      "--tn-color-foreground": "hsl(0 0% 98%)"
    });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("theme.token.value_unsafe");
    expect(result.diagnostics[0]!.severity).toBe("error");
    expect(result.diagnostics[0]!.path).toBe("tokens.--tn-color-background");
  });

  it.each([
    ["hex", "#1a2b3c"],
    ["short hex with alpha", "#1a2b3cff"],
    ["hsl", "hsl(152 60% 38%)"],
    ["rgb with alpha slash", "rgb(0 0 0 / 42%)"],
    ["oklch", "oklch(0.7 0.15 150)"],
    ["color-mix", "color-mix(in srgb, red 50%, blue)"],
    ["var reference", "var(--tn-color-primary)"],
    ["named color", "rebeccapurple"]
  ])("keeps a legitimate %s value", (_label, value) => {
    const result = parseThemeFile(
      buildJson({ tokens: { "--tn-color-background": value } })
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.theme!.tokens).toEqual({ "--tn-color-background": value });
  });
});

describe("KNOWN_THEME_TOKENS", () => {
  it("matches the --tn-color-* custom properties declared in packages/ui/src/styles/tokens.css", () => {
    // Regression guard for drift: tokens.css is the source of truth, this
    // array is a manual copy for platform-agnostic validation. If someone
    // adds/renames/removes a token in the CSS without updating this array,
    // this test fails instead of the mismatch silently degrading to
    // "unknown token" warnings on import.
    const cssPath = new URL(
      "../../ui/src/styles/tokens.css",
      import.meta.url
    );
    const css = readFileSync(cssPath, "utf8");

    const declared = new Set<string>();
    for (const line of css.split("\n")) {
      const match = /^\s*(--tn-color-[a-z0-9-]+):/.exec(line);
      if (match) declared.add(match[1]!);
    }

    expect(declared.size).toBeGreaterThan(0);
    expect(new Set(KNOWN_THEME_TOKENS)).toEqual(declared);
  });

  it("every token starts with --tn-color-", () => {
    for (const token of KNOWN_THEME_TOKENS) {
      expect(token.startsWith("--tn-color-")).toBe(true);
    }
  });

  it("contains no duplicates", () => {
    expect(new Set(KNOWN_THEME_TOKENS).size).toBe(KNOWN_THEME_TOKENS.length);
  });
});

describe("serializeThemeFile", () => {
  const theme: ThemeFile = {
    name: "Forest",
    base: "dark",
    version: 1,
    tokens: {
      "--tn-color-background": "hsl(0 0% 7%)",
      "--tn-color-foreground": "hsl(0 0% 98%)"
    }
  };

  it("produces pretty JSON with 2-space indent and a trailing newline", () => {
    const out = serializeThemeFile(theme);
    expect(out.endsWith("\n")).toBe(true);
    // Re-parse to confirm structural validity.
    const reparsed = JSON.parse(out) as Record<string, unknown>;
    expect(reparsed.name).toBe("Forest");
    expect(reparsed.base).toBe("dark");
    expect(reparsed.version).toBe(1);
    expect(reparsed.tokens).toEqual(theme.tokens);
  });

  it("emits keys in the canonical order: name, base, version, tokens", () => {
    const out = serializeThemeFile(theme);
    const keys = Object.keys(JSON.parse(out) as Record<string, unknown>);
    expect(keys).toEqual(["name", "base", "version", "tokens"]);
  });

  it("round-trips cleanly through parseThemeFile with no diagnostics", () => {
    const out = serializeThemeFile(theme);
    const result = parseThemeFile(out);

    expect(result.diagnostics).toEqual([]);
    expect(result.theme).toEqual(theme);
  });

  it("round-trips a theme with no tokens", () => {
    const empty: ThemeFile = {
      name: "Bare",
      base: "light",
      version: 0,
      tokens: {}
    };
    const result = parseThemeFile(serializeThemeFile(empty));
    expect(result.diagnostics).toEqual([]);
    expect(result.theme).toEqual(empty);
  });
});

describe("bundled preset themes", () => {
  const presets = [
    "forest-dark.tbtheme.json",
    "forest-gray.tbtheme.json",
    "solarized-light.tbtheme.json",
    "one-dark-pro.tbtheme.json",
    "gruvbox-light.tbtheme.json",
    "nord-light.tbtheme.json",
    "catppuccin-latte.tbtheme.json",
    "pastel-pink.tbtheme.json"
  ];

  it.each(presets)("parses %s cleanly with zero diagnostics", (filename) => {
    const filePath = new URL(
      `../../../apps/desktop/src-tauri/presets/themes/${filename}`,
      import.meta.url
    );
    const content = readFileSync(filePath, "utf8");
    const result = parseThemeFile(content);

    expect(result.diagnostics).toEqual([]);
    expect(result.theme).not.toBeNull();
    expect(result.theme!.name.length).toBeGreaterThan(0);
    expect(["light", "dark"]).toContain(result.theme!.base);
  });
});

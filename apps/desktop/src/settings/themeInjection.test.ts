// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ThemeFile } from "@thinkbrain/core";
import { injectThemeOverrides, removeThemeOverrides } from "./themeInjection";

/**
 * themeInjection helper tests (Story 2).
 *
 * Runs under happy-dom so `document.head` is available. Each test starts with
 * a clean `<head>` so the presence/absence of the `<style id="tn-custom-theme">`
 * element can be asserted precisely.
 */

/** A minimal dark-base theme used across tests. */
const DARK_THEME: ThemeFile = {
  name: "Test Dark",
  base: "dark",
  version: 1,
  tokens: {
    "--tn-color-primary": "hsl(152 60% 38%)",
    "--tn-color-background": "hsl(0 0% 7%)"
  }
};

/** A minimal light-base theme for selector-switch assertions. */
const LIGHT_THEME: ThemeFile = {
  name: "Test Light",
  base: "light",
  version: 1,
  tokens: {
    "--tn-color-primary": "hsl(152 50% 50%)"
  }
};

beforeEach(() => {
  // Ensure no leftover <style> element from a prior test.
  removeThemeOverrides();
});

afterEach(() => {
  removeThemeOverrides();
});

describe("injectThemeOverrides", () => {
  it("creates a <style id=\"tn-custom-theme\"> element in document.head", () => {
    injectThemeOverrides(DARK_THEME);

    const style = document.getElementById("tn-custom-theme");
    expect(style).not.toBeNull();
    expect(style?.tagName).toBe("STYLE");
    // The element lives in <head>, not <body>.
    expect(document.head.contains(style)).toBe(true);
  });

  it("replaces the content on a second call instead of creating a second element", () => {
    injectThemeOverrides(DARK_THEME);
    injectThemeOverrides(LIGHT_THEME);

    const styles = document.head.querySelectorAll("#tn-custom-theme");
    expect(styles.length).toBe(1);

    // The content now reflects the light theme's selector.
    const css = styles[0]!.textContent ?? "";
    expect(css).toContain('data-thinkbrain-theme="light"');
    expect(css).not.toContain('data-thinkbrain-theme="dark"');
  });

  it("scopes the rule under :root[data-thinkbrain-theme=\"<base>\"]", () => {
    injectThemeOverrides(DARK_THEME);

    const css = document.getElementById("tn-custom-theme")?.textContent ?? "";
    expect(css).toContain(':root[data-thinkbrain-theme="dark"]');
  });

  it("emits a CSS variable declaration for each token override", () => {
    injectThemeOverrides(DARK_THEME);

    const css = document.getElementById("tn-custom-theme")?.textContent ?? "";
    expect(css).toContain("--tn-color-primary: hsl(152 60% 38%);");
    expect(css).toContain("--tn-color-background: hsl(0 0% 7%);");
  });

  it("emits a rule with an empty body for a theme with no tokens", () => {
    const emptyTheme: ThemeFile = {
      name: "Empty",
      base: "dark",
      version: 1,
      tokens: {}
    };
    injectThemeOverrides(emptyTheme);

    const css = document.getElementById("tn-custom-theme")?.textContent ?? "";
    // Selector still present; body empty.
    expect(css).toContain(':root[data-thinkbrain-theme="dark"]');
    expect(css).not.toContain("--tn-");
  });
});

describe("removeThemeOverrides", () => {
  it("removes the <style> element when one exists", () => {
    injectThemeOverrides(DARK_THEME);
    expect(document.getElementById("tn-custom-theme")).not.toBeNull();

    removeThemeOverrides();

    expect(document.getElementById("tn-custom-theme")).toBeNull();
  });

  it("does not throw when no element exists", () => {
    expect(() => removeThemeOverrides()).not.toThrow();
  });
});

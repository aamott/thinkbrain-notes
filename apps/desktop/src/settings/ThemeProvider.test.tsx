// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeProvider";

/**
 * Static-markup helper.
 *
 * `renderToStaticMarkup` skips effects and DOM APIs, and `isTauri()` is false
 * under Node, so the provider renders in its pre-hydration state: the default
 * theme is exposed through context and no native load is attempted.
 */
function themeMarkup(
  children: React.ReactNode,
  defaultTheme?: "system" | "light" | "dark"
): string {
  return renderToStaticMarkup(
    <ThemeProvider defaultTheme={defaultTheme}>{children}</ThemeProvider>
  );
}

/** Renders the current theme value via `useTheme` for assertion. */
function ThemeProbe(): React.ReactElement {
  const { theme } = useTheme();
  return <span data-testid="theme">{theme}</span>;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  document.documentElement.removeAttribute("data-thinkbrain-theme");
});

describe("ThemeProvider", () => {
  it("renders its children", () => {
    const markup = themeMarkup(<p>child content</p>);

    expect(markup).toContain("child content");
  });

  it("exposes the default theme through useTheme before native hydration", () => {
    const markup = themeMarkup(<ThemeProbe />, "dark");

    expect(markup).toContain('data-testid="theme"');
    expect(markup).toContain(">dark</span>");
  });

  it("defaults to the system theme when no defaultTheme is provided", () => {
    const markup = themeMarkup(<ThemeProbe />);

    expect(markup).toContain(">system</span>");
  });

  it("sets data-thinkbrain-theme on the document root when effects run", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    document.documentElement.removeAttribute("data-thinkbrain-theme");

    await act(async () => {
      root?.render(
        <ThemeProvider defaultTheme="dark">
          <ThemeProbe />
        </ThemeProvider>
      );
    });

    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");
  });
});

// @vitest-environment happy-dom
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { compile } from "tailwindcss";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../settings/ThemeProvider";
import { DesktopShell } from "../shell/DesktopShell";
import { PhoneShell } from "../shell/phone/PhoneShell";
import { useShellState, type ShellState } from "../shell/useShellState";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => false) }));
vi.mock("../native/commands", () => ({
  invokeNativeCommand: vi.fn(() => Promise.resolve(null))
}));

/**
 * What the popout's box actually is at a phone width, rather than what its
 * class attribute says.
 *
 * The inset is a cascade question — an `@media` block, a custom property with a
 * fallback, and whichever ancestor overrides it — so asserting on class strings
 * would prove only that the strings are the ones that were written. Here the
 * real Tailwind compiler turns the rendered elements' own class list into CSS,
 * the real token sheet supplies `--tn-size-activitybar-width`, and happy-dom
 * resolves the cascade. An element with only one horizontal edge reports the
 * other as `auto`, which is exactly the shrink-to-fit bug this guards.
 */
// Vitest's happy-dom environment leaves `import.meta.url` on a non-file
// scheme, so paths are resolved from the vitest project root (`apps/desktop`),
// which is also what `compile`'s `base` uses.
const require_ = createRequire(resolve(process.cwd(), "package.json"));
const tokensPath = resolve(process.cwd(), "../../packages/ui/src/styles/tokens.css");

let tokensCss = "";

beforeAll(async () => {
  tokensCss = await readFile(tokensPath, "utf8");
});

const compileClasses = async (candidates: readonly string[]): Promise<string> => {
  const compiler = await compile(
    // Unlayered on purpose: happy-dom's cascade does not implement `@layer`,
    // and the app's own entry only wraps these for ordering against rules this
    // test does not have.
    `@import "tailwindcss/theme.css";
     @import "tailwindcss/utilities.css";`,
    {
      base: process.cwd(),
      loadStylesheet: async (id: string, base: string) => {
        const path = require_.resolve(id);
        return { path, base, content: await readFile(path, "utf8") };
      }
    }
  );
  return compiler.build([...candidates]);
};

/** Every class actually present in the rendered tree — no hand-copied list. */
const renderedClasses = (host: HTMLElement): readonly string[] => {
  const seen = new Set<string>();
  for (const element of [host, ...host.querySelectorAll("*")]) {
    for (const name of element.getAttribute("class")?.split(/\s+/) ?? []) {
      if (name) seen.add(name);
    }
  }
  return [...seen];
};

const styleTag = (css: string): HTMLStyleElement => {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  return style;
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const styles: HTMLStyleElement[] = [];

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  while (styles.length) styles.pop()?.remove();
  root = null;
  container = null;
  live = null;
});

/** A phone-sized window, so the `max-[760px]` block is the one that applies. */
const PHONE_WIDTH = 400;

/**
 * happy-dom's own viewport control, which its media-query evaluation reads.
 * The DOM lib has no such property, so it is reached through a narrow cast
 * rather than widening `window`.
 */
type HappyWindow = { happyDOM: { setViewport: (size: { width: number; height: number }) => void } };

let live: ShellState | null = null;

const mount = async (chrome: "phone" | "desktop"): Promise<HTMLDivElement> => {
  (window as unknown as HappyWindow).happyDOM.setViewport({ width: PHONE_WIDTH, height: 800 });
  const Host = () => {
    const shell = useShellState();
    live = shell;
    return chrome === "phone" ? <PhoneShell shell={shell} /> : <DesktopShell shell={shell} />;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ThemeProvider>
        <Host />
      </ThemeProvider>
    );
  });
  return container;
};

const shell = (): ShellState => {
  if (!live) throw new Error("shell did not render");
  return live;
};

/** Compiles the mounted tree's own classes and hands back the live cascade. */
const applyStyles = async (host: HTMLElement): Promise<void> => {
  styles.push(styleTag(tokensCss));
  styles.push(styleTag(await compileClasses(renderedClasses(host))));
};

const boxOf = (element: Element) => {
  const style = window.getComputedStyle(element);
  return { position: style.position, left: style.left, right: style.right };
};

describe("popout inset below 760px", () => {
  it("spans the phone shell edge to edge", async () => {
    const host = await mount("phone");
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Primary navigation"] [aria-label="Search"]')?.click();
    });
    const panel = host.querySelector('[aria-label="Search panel"]');
    expect(panel).not.toBeNull();

    await applyStyles(host);

    // No rail to clear, and a second edge so the box has a width at all.
    expect(boxOf(panel!)).toEqual({ position: "absolute", left: "0px", right: "0px" });
    expect(host.querySelector('[aria-label="Workspace sections"]')).toBeNull();
  });

  it("still clears the activity rail in a narrow desktop window", async () => {
    const host = await mount("desktop");
    const panel = host.querySelector('[aria-label="Files panel"]');
    expect(panel).not.toBeNull();
    // The same breakpoint catches a narrow *desktop* window, which does render
    // the rail — so the popout must not go full-bleed here.
    expect(host.querySelector('[aria-label="Workspace sections"]')).not.toBeNull();

    await applyStyles(host);

    expect(boxOf(panel!)).toEqual({ position: "absolute", left: "48px", right: "0px" });
  });

  // Same reasoning on the other side: the right dock overlays the editor at
  // this width, but the rail it would otherwise cover is the only way back.
  it("leaves the rail uncovered by the right dock too", async () => {
    const host = await mount("desktop");
    await act(async () => shell().setRightPanel("outline"));
    const panel = host.querySelector('[aria-label="Outline panel"]');
    expect(panel).not.toBeNull();

    await applyStyles(host);

    expect(boxOf(panel!)).toEqual({ position: "absolute", left: "48px", right: "0px" });
  });
});

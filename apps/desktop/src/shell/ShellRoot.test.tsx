// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../settings/ThemeProvider";
import { ShellRoot, usePhoneChrome } from "./ShellRoot";

let narrow = false;
let coarse = false;

// The gate's two inputs are stubbed so each form factor is a plain assignment;
// driving them through matchMedia is `useNarrowViewport`'s own test's job.
vi.mock("./useNarrowViewport", () => ({ useNarrowViewport: () => narrow }));
vi.mock("../journal/useCoarsePointer", () => ({ useCoarsePointer: () => coarse }));

// `ShellRoot` mounts the real shell state, which boots the workspace lifecycle
// and reaches for Tauri IPC when it believes it is running under Tauri. Mock
// both so the restore path is a no-op, matching `useShellState.test.tsx`.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false)
}));

vi.mock("../native/commands", () => ({
  invokeNativeCommand: vi.fn(() => Promise.resolve(null))
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/**
 * Mounts `ShellRoot` under `ThemeProvider` — `useShellState` consumes
 * `useTheme()` for the theme-toggle command and throws outside the provider.
 */
const render = async (): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ThemeProvider>
        <ShellRoot />
      </ThemeProvider>
    );
  });
  return container;
};

describe("ShellRoot", () => {
  it("renders desktop chrome on a wide mouse-driven window", async () => {
    narrow = false;
    coarse = false;

    const host = await render();

    expect(host.querySelector('[aria-label="ThinkBrain desktop workspace"]')).not.toBeNull();
  });

  it("keeps desktop chrome in a narrow window driven by a mouse", async () => {
    narrow = true;
    coarse = false;

    const host = await render();

    expect(host.querySelector('[aria-label="ThinkBrain desktop workspace"]')).not.toBeNull();
  });

  it("keeps desktop chrome on a wide touch screen", async () => {
    narrow = false;
    coarse = true;

    const host = await render();

    expect(host.querySelector('[aria-label="ThinkBrain desktop workspace"]')).not.toBeNull();
  });
});

describe("usePhoneChrome", () => {
  /** Reads the gate with no chrome mounted, so only the gate is under test. */
  const gate = async (): Promise<boolean> => {
    const box: { current: boolean | null } = { current: null };
    function Probe(): null {
      box.current = usePhoneChrome();
      return null;
    }
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Probe />));
    if (box.current === null) throw new Error("usePhoneChrome did not render");
    return box.current;
  };

  // The whole truth table. Without the fourth row, `coarse && narrow` and
  // `coarse || narrow` are indistinguishable — and the `||` version would hand
  // phone chrome to every touchscreen laptop and every narrow desktop window.
  it.each([
    { coarseInput: false, narrowInput: false, expected: false },
    { coarseInput: false, narrowInput: true, expected: false },
    { coarseInput: true, narrowInput: false, expected: false },
    { coarseInput: true, narrowInput: true, expected: true }
  ])(
    "is $expected for a coarse=$coarseInput narrow=$narrowInput window",
    async ({ coarseInput, narrowInput, expected }) => {
      coarse = coarseInput;
      narrow = narrowInput;

      expect(await gate()).toBe(expected);
    }
  );
});

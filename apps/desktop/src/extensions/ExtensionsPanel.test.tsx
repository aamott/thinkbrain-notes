// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExtensionsPanel } from "./ExtensionsPanel";
import { setLocalExtensions } from "./localExtensionsRef";
import type { LocalExtensions, StartupFailure } from "./localExtensions";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  setLocalExtensions(null);
});

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

// A stable reference: useSyncExternalStore requires a cached snapshot — a
// `() => []` default would re-render forever.
const NO_FAILURES: readonly StartupFailure[] = [];

/** A `LocalExtensions` stub with the few members a test cares about overridable. */
const localStub = (
  overrides: Partial<LocalExtensions> = {}
): LocalExtensions => ({
  add: async () => ({ loaded: true, diagnostics: [] }),
  reload: async () => ({ loaded: true, diagnostics: [] }),
  remove: async () => undefined,
  forget: async () => undefined,
  restore: async () => undefined,
  startupFailures: () => NO_FAILURES,
  subscribe: () => () => undefined,
  ...overrides
});

describe("ExtensionsPanel", () => {
  it("shows an empty state when nothing is installed", async () => {
    const host = await render(<ExtensionsPanel entries={[]} />);
    expect(host.textContent).toContain("No extensions are installed");
  });

  it("lists each extension with a human-readable status", async () => {
    const host = await render(
      <ExtensionsPanel
        entries={[{ id: "note-stats", name: "Note Stats", status: "registered",
      source: "built-in", reasons: [] }]}
      />
    );
    expect(host.textContent).toContain("Note Stats");
    expect(host.textContent).toContain("Not started");
    expect(host.querySelector('[data-status="registered"]')).not.toBeNull();
  });

  it("surfaces compatibility reasons for an incompatible extension", async () => {
    const host = await render(
      <ExtensionsPanel
        entries={[
          {
            id: "broken",
            name: "Broken",
            status: "incompatible",
      source: "built-in",
            reasons: [{ code: "api-version", message: "Requires host api ^9.0.0", severity: "error" }]
          }
        ]}
      />
    );
    expect(host.textContent).toContain("Incompatible");
    expect(host.textContent).toContain("Requires host api ^9.0.0");
  });

  it("reports stored directories that failed to load at startup", async () => {
    // A stable reference: useSyncExternalStore requires a cached snapshot.
    const failures = [
      {
        directory: "/ext/gone",
        diagnostics: [
          { code: "manifest_unreadable", message: "Could not read extension.json", severity: "error" as const }
        ]
      }
    ];
    const local = localStub({ startupFailures: () => failures });
    setLocalExtensions(local);

    const host = await render(<ExtensionsPanel entries={[]} />);

    const failedList = host.querySelector('[aria-label="Extensions that failed to load"]');
    expect(failedList?.textContent).toContain("/ext/gone");
    expect(failedList?.textContent).toContain("Could not read extension.json");
  });

  it("forgets a failed directory through its Remove action", async () => {
    const forget = vi.fn(async () => undefined);
    const failures = [
      {
        directory: "/ext/gone",
        diagnostics: [
          { code: "manifest_unreadable", message: "Could not read extension.json", severity: "error" as const }
        ]
      }
    ];
    const local = localStub({ startupFailures: () => failures, forget });
    setLocalExtensions(local);
    const host = await render(<ExtensionsPanel entries={[]} />);

    const button = host.querySelector<HTMLButtonElement>('[aria-label="Remove /ext/gone"]');
    expect(button).not.toBeNull();
    await act(async () => button!.click());

    expect(forget).toHaveBeenCalledWith("/ext/gone");
  });

  it("retries a failed directory through the same path as a fresh add", async () => {
    const add = vi.fn(async () => ({ loaded: true, diagnostics: [] }));
    const failures = [
      {
        directory: "/ext/gone",
        diagnostics: [
          { code: "manifest_unreadable", message: "Could not read extension.json", severity: "error" as const }
        ]
      }
    ];
    const local = localStub({ startupFailures: () => failures, add });
    setLocalExtensions(local);
    const host = await render(<ExtensionsPanel entries={[]} />);

    const button = host.querySelector<HTMLButtonElement>('[aria-label="Retry loading /ext/gone"]');
    expect(button).not.toBeNull();
    await act(async () => button!.click());

    expect(add).toHaveBeenCalledWith("/ext/gone");
  });

  it("observes a controller published only after the panel mounts", async () => {
    // The refs are module globals published by startup; a panel mounted before
    // that must still find the source rather than showing `empty` forever.
    const host = await render(<ExtensionsPanel entries={[]} />);
    expect(host.textContent).not.toContain("late failure");

    const failures = [
      {
        directory: "/ext/late",
        diagnostics: [
          { code: "manifest_unreadable", message: "late failure", severity: "error" as const }
        ]
      }
    ];
    const local = localStub({ startupFailures: () => failures });

    await act(async () => {
      setLocalExtensions(local);
      // The hook re-checks for a late-published source on a short timer.
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    expect(host.textContent).toContain("late failure");
  });
});

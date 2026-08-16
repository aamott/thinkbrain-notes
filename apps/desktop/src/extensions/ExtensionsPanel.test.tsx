// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ExtensionsPanel } from "./ExtensionsPanel";
import { setLocalExtensions } from "./localExtensionsRef";
import type { LocalExtensions } from "./localExtensions";

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
    const local: LocalExtensions = {
      add: async () => ({ loaded: true, diagnostics: [] }),
      reload: async () => ({ loaded: true, diagnostics: [] }),
      remove: async () => undefined,
      restore: async () => undefined,
      startupFailures: () => failures,
      subscribe: () => () => undefined
    };
    setLocalExtensions(local);

    const host = await render(<ExtensionsPanel entries={[]} />);

    const errors = host.querySelector('[aria-label="Extension load errors"]');
    expect(errors?.textContent).toContain("/ext/gone");
    expect(errors?.textContent).toContain("Could not read extension.json");
  });
});

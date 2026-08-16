// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { desktopCommandRegistry, useDesktopCommands } from "./commandRegistry";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function CommandTitles(): React.ReactElement {
  const commands = useDesktopCommands();
  return <ul>{commands.map((command) => <li key={command.id}>{command.title}</li>)}</ul>;
}

const render = async (): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<CommandTitles />));
  return container;
};

describe("useDesktopCommands", () => {
  it("returns the registered commands", async () => {
    const host = await render();

    expect(host.textContent).toContain("Open extensions");
  });

  /**
   * An extension loaded from disk registers its commands while the palette is
   * already mounted, so the subscription — not the render that happened to
   * follow — is what must surface them.
   */
  it("shows a command registered after the first render", async () => {
    const host = await render();
    expect(host.textContent).not.toContain("Late Command");

    const registration = desktopCommandRegistry.register({
      id: "late-command",
      title: "Late Command",
      availability: "available",
      handler: () => undefined
    });

    try {
      await act(async () => undefined);
      expect(host.textContent).toContain("Late Command");
    } finally {
      registration.dispose();
    }
  });
});

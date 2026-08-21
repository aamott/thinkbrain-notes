import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export async function render(element: ReactElement): Promise<{
  host: HTMLDivElement;
  unmount: () => Promise<void>;
}> {
  const nextHost = document.createElement("div");
  document.body.append(nextHost);
  const nextRoot = createRoot(nextHost);
  root = nextRoot;
  host = nextHost;
  await act(async () => nextRoot.render(element));

  let mounted = true;
  return {
    host: nextHost,
    unmount: async () => {
      if (!mounted) return;
      mounted = false;
      await act(async () => nextRoot.unmount());
      nextHost.remove();
      if (root === nextRoot) {
        root = null;
        host = null;
      }
    }
  };
}

export async function cleanup(): Promise<void> {
  if (root) {
    await act(async () => root?.unmount());
  }
  host?.remove();
  root = null;
  host = null;
}

export function button(host: HTMLElement, text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text)
  );
  if (!found) throw new Error(`No button reading "${text}" among: ${host.textContent}`);
  return found;
}

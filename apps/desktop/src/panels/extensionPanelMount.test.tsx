// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExtensionPanelMountPoint,
  type ExtensionPanelMount,
  type ExtensionPanelState
} from "./extensionPanelMount";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

const rerender = async (element: React.ReactElement): Promise<void> => {
  await act(async () => root?.render(element));
};

describe("ExtensionPanelMountPoint", () => {
  it("hands the extension an element it owns and the current state", async () => {
    const mount: ExtensionPanelMount = (element, context) => {
      element.textContent = `${context.state.rootPath}:${context.state.documentContents}`;
    };

    const host = await render(
      <ExtensionPanelMountPoint mount={mount} rootPath="/vault" documentContents="# Note" />
    );

    expect(host.textContent).toBe("/vault:# Note");
  });

  it("notifies a mounted panel when the host state changes, but not on mount", async () => {
    const seen: ExtensionPanelState[] = [];
    const mount: ExtensionPanelMount = (_element, context) => {
      context.onDidChange((state) => seen.push(state));
    };

    await render(
      <ExtensionPanelMountPoint mount={mount} rootPath="/vault" documentContents="first" />
    );
    expect(seen).toEqual([]);

    await rerender(
      <ExtensionPanelMountPoint mount={mount} rootPath="/vault" documentContents="second" />
    );

    expect(seen).toEqual([{ rootPath: "/vault", documentContents: "second" }]);
  });

  it("does not re-mount the panel when only the state changes", async () => {
    const mount = vi.fn<ExtensionPanelMount>();

    await render(<ExtensionPanelMountPoint mount={mount} rootPath="/vault" documentContents="a" />);
    await rerender(<ExtensionPanelMountPoint mount={mount} rootPath="/vault" documentContents="b" />);

    expect(mount).toHaveBeenCalledTimes(1);
  });

  it("runs the panel's cleanup and clears the element on unmount", async () => {
    const cleanup = vi.fn();
    const mount: ExtensionPanelMount = (element) => {
      element.append(document.createElement("span"));
      return cleanup;
    };

    const host = await render(
      <ExtensionPanelMountPoint mount={mount} rootPath={null} documentContents={null} />
    );
    const mounted = host.querySelector("span");
    expect(mounted).not.toBeNull();

    await act(async () => root?.unmount());
    root = null;

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("disposes a Disposable a mount returns instead of a cleanup function", async () => {
    const dispose = vi.fn();
    const onError = vi.fn();
    // A disk-loaded extension is plain JS: the natural teardown to return is
    // the same { dispose() } every other extension API hands back.
    const mount: ExtensionPanelMount = () => ({ dispose });

    await render(
      <ExtensionPanelMountPoint
        mount={mount}
        rootPath={null}
        documentContents={null}
        onError={onError}
      />
    );
    await act(async () => root?.unmount());
    root = null;

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("runs every teardown when a mount returns a list of disposables", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const mount: ExtensionPanelMount = () => [{ dispose: first }, { dispose: second }];

    await render(<ExtensionPanelMountPoint mount={mount} rootPath={null} documentContents={null} />);
    await act(async () => root?.unmount());
    root = null;

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("keeps running the remaining teardowns when one throws", async () => {
    const second = vi.fn();
    const onError = vi.fn();
    const mount: ExtensionPanelMount = () => [
      {
        dispose: () => {
          throw new Error("teardown boom");
        }
      },
      { dispose: second }
    ];

    await render(
      <ExtensionPanelMountPoint
        mount={mount}
        rootPath={null}
        documentContents={null}
        onError={onError}
      />
    );
    await act(async () => root?.unmount());
    root = null;

    expect(second).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "teardown boom" }));
  });

  it("stops notifying a panel once it is unmounted", async () => {
    const listener = vi.fn();
    const mount: ExtensionPanelMount = (_element, context) => {
      context.onDidChange(listener);
    };

    await render(<ExtensionPanelMountPoint mount={mount} rootPath={null} documentContents="a" />);
    await act(async () => root?.unmount());
    root = null;

    expect(listener).not.toHaveBeenCalled();
  });

  it("reports a panel that throws while mounting instead of failing the shell", async () => {
    const onError = vi.fn();
    const mount: ExtensionPanelMount = () => {
      throw new Error("boom");
    };

    const host = await render(
      <ExtensionPanelMountPoint
        mount={mount}
        rootPath={null}
        documentContents={null}
        onError={onError}
      />
    );

    expect(host.textContent).toContain("failed to render");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
  });

  it("isolates one failing state listener from the others", async () => {
    const second = vi.fn();
    const onError = vi.fn();
    const mount: ExtensionPanelMount = (_element, context) => {
      context.onDidChange(() => {
        throw new Error("listener boom");
      });
      context.onDidChange(second);
    };

    await render(
      <ExtensionPanelMountPoint
        mount={mount}
        rootPath={null}
        documentContents="a"
        onError={onError}
      />
    );
    await rerender(
      <ExtensionPanelMountPoint
        mount={mount}
        rootPath={null}
        documentContents="b"
        onError={onError}
      />
    );

    expect(second).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "listener boom" }));
  });

  it("stops notifying a listener that has been disposed", async () => {
    const listener = vi.fn();
    const mount: ExtensionPanelMount = (_element, context) => {
      const subscription = context.onDidChange(listener);
      subscription.dispose();
    };

    await render(<ExtensionPanelMountPoint mount={mount} rootPath={null} documentContents="a" />);
    await rerender(<ExtensionPanelMountPoint mount={mount} rootPath={null} documentContents="b" />);

    expect(listener).not.toHaveBeenCalled();
  });
});

// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { usePhoneNavigation, type PhoneNavigation } from "./usePhoneNavigation";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const renderNav = async (workspace: string | null): Promise<() => PhoneNavigation> => {
  const box: { current: PhoneNavigation | null } = { current: null };
  const Probe = ({ ws }: { readonly ws: string | null }) => {
    box.current = usePhoneNavigation(ws);
    return null;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Probe ws={workspace} />);
  });
  return () => {
    if (!box.current) throw new Error("hook did not render");
    return box.current;
  };
};

describe("usePhoneNavigation", () => {
  it("starts at Files, depth 0, with nothing to go back to", async () => {
    const nav = await renderNav("/vault");

    expect(nav().route).toEqual({ kind: "files" });
    expect(nav().depth).toBe(0);
    expect(nav().canGoBack).toBe(false);
    expect((window.history.state as { tnPhoneNav?: boolean }).tnPhoneNav).toBe(true);
  });

  it("pushes routes onto history and reports depth", async () => {
    const nav = await renderNav("/vault");

    await act(async () => nav().push({ kind: "panel", panel: "search" }));
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));

    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:b" });
    expect(nav().depth).toBe(2);
    expect(nav().canGoBack).toBe(true);
  });

  it("ignores a push identical to the current route", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "panel", panel: "search" }));

    await act(async () => nav().push({ kind: "panel", panel: "search" }));

    expect(nav().depth).toBe(1);
  });

  it("restores the previous route when browser history pops", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "panel", panel: "search" }));
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));

    await act(async () => window.history.back());
    expect(nav().route).toEqual({ kind: "panel", panel: "search" });
    expect(nav().depth).toBe(1);

    await act(async () => window.history.back());
    expect(nav().route).toEqual({ kind: "files" });
    expect(nav().depth).toBe(0);
    expect(nav().canGoBack).toBe(false);
  });

  it("back() walks the same stack and stops at the root", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "panel", panel: "search" }));

    await act(async () => nav().back());
    expect(nav().route).toEqual({ kind: "files" });

    // At the root, back() must not touch shared history.
    const before = window.history.state;
    await act(async () => nav().back());
    expect(window.history.state).toBe(before);
  });

  it("falls back to Files when the popped state is not ours", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    expect(nav().route).toEqual({ kind: "files" });
    expect(nav().depth).toBe(0);
  });

  it("replace keeps depth but rewrites the current entry", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:old" }));

    await act(async () => nav().replace({ kind: "tab", tabId: "editor:a:new" }));

    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:new" });
    expect(nav().depth).toBe(1);
    // Replaced, not pushed: one Back reaches the root.
    await act(async () => nav().back());
    expect(nav().route).toEqual({ kind: "files" });
  });

  it("resets to Files when the workspace changes", async () => {
    const box: { current: PhoneNavigation | null } = { current: null };
    const Probe = ({ ws }: { readonly ws: string | null }) => {
      box.current = usePhoneNavigation(ws);
      return null;
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<Probe ws="/vault-a" />);
    });
    await act(async () => box.current?.push({ kind: "tab", tabId: "editor:a:b" }));
    await act(async () => box.current?.back());
    expect(box.current?.canGoForward).toBe(true);

    await act(async () => {
      root?.render(<Probe ws="/vault-b" />);
    });

    expect(box.current?.route).toEqual({ kind: "files" });
    expect(box.current?.depth).toBe(0);
    // The old workspace's branch tip must not leak Forward into the new one.
    expect(box.current?.canGoForward).toBe(false);
    expect((window.history.state as { workspace?: string }).workspace).toBe("/vault-b");
  });

  it("does not resurrect the previous workspace's route on A→B→A without navigating", async () => {
    const box: { current: PhoneNavigation | null } = { current: null };
    const Probe = ({ ws }: { readonly ws: string | null }) => {
      box.current = usePhoneNavigation(ws);
      return null;
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<Probe ws="/vault-a" />);
    });
    await act(async () => box.current?.push({ kind: "tab", tabId: "editor:a:b" }));
    expect(box.current?.depth).toBe(1);

    // Round-trip the workspace without any navigation: A's last entry is
    // history, not state to resurrect.
    await act(async () => {
      root?.render(<Probe ws="/vault-b" />);
    });
    await act(async () => {
      root?.render(<Probe ws="/vault-a" />);
    });

    expect(box.current?.route).toEqual({ kind: "files" });
    expect(box.current?.depth).toBe(0);
    expect(box.current?.canGoBack).toBe(false);
    expect(box.current?.canGoForward).toBe(false);
  });
});

describe("usePhoneNavigation overlays", () => {
  it("starts with no overlay and pushes one over the current route", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));

    expect(nav().overlay).toBeNull();
    await act(async () => nav().openOverlay({ kind: "navigation" }));

    expect(nav().overlay).toEqual({ kind: "navigation" });
    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:b" });
    expect(nav().depth).toBe(2);
  });

  it("no-ops when the identical overlay is already current", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().openOverlay({ kind: "tabs" }));
    await act(async () => nav().openOverlay({ kind: "tabs" }));

    expect(nav().overlay).toEqual({ kind: "tabs" });
    expect(nav().depth).toBe(1);
  });

  it("restores route AND overlay on browser pop", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));
    await act(async () => nav().openOverlay({ kind: "tabs" }));

    await act(async () => window.history.back());
    expect(nav().overlay).toBeNull();
    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:b" });
  });

  it("actions → inspector → back() returns to the actions menu", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));
    await act(async () => nav().openOverlay({ kind: "actions" }));
    await act(async () =>
      nav().openOverlay({ kind: "inspector", panel: "outline", parent: "actions" })
    );

    await act(async () => nav().back());
    expect(nav().overlay).toEqual({ kind: "actions" });
    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:b" });
  });

  it("dismissOverlay(wholeFlow) skips the actions entry under an actions-parent inspector", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));
    await act(async () => nav().openOverlay({ kind: "actions" }));
    await act(async () =>
      nav().openOverlay({ kind: "inspector", panel: "outline", parent: "actions" })
    );

    await act(async () => nav().dismissOverlay(true));
    expect(nav().overlay).toBeNull();
    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:b" });
  });

  it("dismissOverlay(wholeFlow) is a single step for a content-parent inspector", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));
    await act(async () =>
      nav().openOverlay({ kind: "inspector", panel: "outline", parent: "content" })
    );

    await act(async () => nav().dismissOverlay(true));
    expect(nav().overlay).toBeNull();
    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:b" });
  });

  it("back() dismisses the overlay before touching content history", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));
    await act(async () => nav().openOverlay({ kind: "navigation" }));

    await act(async () => nav().back());
    expect(nav().overlay).toBeNull();
    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:b" });

    await act(async () => nav().back());
    expect(nav().route).toEqual({ kind: "files" });
  });

  it("push clears the overlay from the new entry", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().openOverlay({ kind: "navigation" }));
    await act(async () => nav().push({ kind: "panel", panel: "search" }));

    expect(nav().overlay).toBeNull();
    expect(nav().route).toEqual({ kind: "panel", panel: "search" });
  });

  it("replace clears the overlay in place", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().openOverlay({ kind: "navigation" }));
    await act(async () => nav().replace({ kind: "panel", panel: "search" }));

    expect(nav().overlay).toBeNull();
    expect(nav().route).toEqual({ kind: "panel", panel: "search" });
    expect(nav().depth).toBe(1);
  });

  it("showOverlay swaps an open overlay in place instead of stacking it", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));
    await act(async () => nav().showOverlay({ kind: "navigation" }));

    await act(async () => nav().showOverlay({ kind: "new-note" }));

    // The navigation entry was replaced, not pushed over: depth is unchanged
    // and one Back lands on the tab, never on the stale overlay.
    expect(nav().overlay).toEqual({ kind: "new-note" });
    expect(nav().depth).toBe(2);
    await act(async () => nav().back());
    expect(nav().overlay).toBeNull();
    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:b" });
  });

  it("showOverlay pushes normally when no overlay is open", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));

    await act(async () => nav().showOverlay({ kind: "tabs" }));

    expect(nav().overlay).toEqual({ kind: "tabs" });
    expect(nav().depth).toBe(2);
    await act(async () => nav().back());
    expect(nav().overlay).toBeNull();
    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:b" });
  });

  it("showOverlay no-ops on the identical overlay", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().showOverlay({ kind: "tabs" }));
    const before = window.history.state;
    await act(async () => nav().showOverlay({ kind: "tabs" }));

    expect(nav().depth).toBe(1);
    expect(window.history.state).toBe(before);
  });

  it("falls back to Files with no overlay on a foreign popped state", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().openOverlay({ kind: "tabs" }));

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { foreign: true } }));
    });

    expect(nav().overlay).toBeNull();
    expect(nav().route).toEqual({ kind: "files" });
  });
});

describe("usePhoneNavigation Android Back bridge", () => {
  it("installs __thinkbrainHandleAndroidBack while mounted and removes it on unmount", async () => {
    await renderNav("/vault");
    expect(typeof window.__thinkbrainHandleAndroidBack).toBe("function");

    await act(async () => root?.unmount());
    root = null;
    expect(window.__thinkbrainHandleAndroidBack).toBeUndefined();
  });

  it("returns true and pops one entry above the root", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));
    await act(async () => nav().openOverlay({ kind: "tabs" }));

    let consumed = false;
    await act(async () => {
      consumed = window.__thinkbrainHandleAndroidBack?.() === true;
    });

    // The overlay entry went first, matching every other Back path.
    expect(consumed).toBe(true);
    expect(nav().overlay).toBeNull();
    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:b" });
  });

  it("returns false and changes nothing at the root", async () => {
    const nav = await renderNav("/vault");
    const before = window.history.state;

    let consumed = true;
    await act(async () => {
      consumed = window.__thinkbrainHandleAndroidBack?.() === true;
    });

    expect(consumed).toBe(false);
    expect(window.history.state).toBe(before);
    expect(nav().route).toEqual({ kind: "files" });
    expect(nav().depth).toBe(0);
  });
});

describe("usePhoneNavigation forward", () => {
  it("Back makes Forward available and Forward restores the route and overlay", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));
    await act(async () => nav().openOverlay({ kind: "tabs" }));
    expect(nav().canGoForward).toBe(false);

    await act(async () => nav().back());
    expect(nav().overlay).toBeNull();
    expect(nav().canGoForward).toBe(true);

    await act(async () => nav().forward());
    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:b" });
    expect(nav().overlay).toEqual({ kind: "tabs" });
    expect(nav().canGoForward).toBe(false);
  });

  it("a push after Back truncates the forward branch", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:first" }));
    await act(async () => nav().back());
    expect(nav().canGoForward).toBe(true);

    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:second" }));

    // The branch we left behind is gone: Forward is both disabled and inert.
    expect(nav().canGoForward).toBe(false);
    await act(async () => nav().forward());
    expect(nav().route).toEqual({ kind: "tab", tabId: "editor:a:second" });
  });

  it("a foreign popped state clears Forward", async () => {
    const nav = await renderNav("/vault");
    await act(async () => nav().push({ kind: "tab", tabId: "editor:a:b" }));
    await act(async () => nav().back());
    expect(nav().canGoForward).toBe(true);

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    expect(nav().route).toEqual({ kind: "files" });
    expect(nav().canGoForward).toBe(false);
  });
});

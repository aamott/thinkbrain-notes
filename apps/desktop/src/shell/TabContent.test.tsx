// @vitest-environment happy-dom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  registerEditorView,
  subscribeEditorViews,
  unregisterEditorView
} from "../tabs/editorLocationRegistry";
import { createNewTab } from "../tabs/tabModel";
import { TabContent } from "./TabContent";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const registered: { key: string; view: EditorView }[] = [];

/** A mounted view standing in for the tab's kept-alive editor. */
const mountView = (key: string): void => {
  const host = document.createElement("div");
  document.body.append(host);
  const view = new EditorView({ parent: host, state: EditorState.create({ doc: "x" }) });
  registerEditorView(key, view);
  registered.push({ key, view });
};

const render = async (tabId: string, active: boolean): Promise<void> => {
  const tab = { ...createNewTab(), id: tabId };
  await act(async () => {
    root!.render(
      <TabContent
        tab={tab}
        document={undefined}
        onChange={() => undefined}
        onSave={async () => true}
        onRestoreVersion={async () => undefined}
        active={active}
      />
    );
  });
};

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  for (const { key, view } of registered.splice(0)) {
    unregisterEditorView(key, view);
    view.destroy();
  }
  document.body.replaceChildren();
});

describe("TabContent visibility notification", () => {
  it("announces the surface when it becomes active with a live editor", async () => {
    mountView("tab-live");
    const ticks: string[] = [];
    const unsubscribe = subscribeEditorViews(() => ticks.push("tick"));

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    // Mounted but covered (the phone's Home/panel route) announces nothing.
    await render("tab-live", false);
    const hidden = ticks.length;
    await render("tab-live", true);
    expect(ticks.length).toBe(hidden + 1);
    // Staying active across re-renders announces once, not per render.
    await render("tab-live", true);
    expect(ticks.length).toBe(hidden + 1);

    unsubscribe();
  });

  it("stays silent for a tab with no registered editor", async () => {
    const ticks: string[] = [];
    const unsubscribe = subscribeEditorViews(() => ticks.push("tick"));

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await render("tab-no-editor", false);
    await render("tab-no-editor", true);
    expect(ticks).toHaveLength(0);

    unsubscribe();
  });
});

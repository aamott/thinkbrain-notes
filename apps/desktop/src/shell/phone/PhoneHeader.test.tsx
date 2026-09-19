import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NOT_RECORDING } from "../../sync/historyTypes";
import { PhoneHeader } from "./PhoneHeader";

const base = {
  title: "Files",
  tabCount: 0,
  syncStatus: NOT_RECORDING,
  onBack: () => {},
  onOpenTabs: () => {},
  onOpenInspector: () => {},
  onOpenSyncPanel: () => {}
};

describe("PhoneHeader", () => {
  it("has no navigation button — the hub's Menu slot owns the drawer", () => {
    const markup = renderToStaticMarkup(<PhoneHeader {...base} canGoBack={false} />);

    expect(markup).not.toContain("Open navigation");
  });

  it("renders Back only when content history exists", () => {
    const atRoot = renderToStaticMarkup(<PhoneHeader {...base} canGoBack={false} />);
    const deeper = renderToStaticMarkup(<PhoneHeader {...base} canGoBack={true} />);

    expect(atRoot).not.toContain('aria-label="Back"');
    expect(deeper).toContain('aria-label="Back"');
  });

  it("keeps an inert left slot at the root so the title stays centered", () => {
    const markup = renderToStaticMarkup(<PhoneHeader {...base} canGoBack={false} />);

    expect(markup).toContain('aria-hidden="true" class="size-11 shrink-0"');
  });
});

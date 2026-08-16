// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

describe("link live preview", () => {
  it("shows only the link text when the cursor is elsewhere", () => {
    preview = mountPreview("see [docs](https://example.com) now", 0);
    expect(preview.lineText(1)).toBe("see docs now");
  });

  it("reveals the full source when the cursor is inside the link", () => {
    preview = mountPreview("see [docs](https://example.com) now", 7);
    expect(preview.lineText(1)).toBe("see [docs](https://example.com) now");
  });

  it("styles the link text", () => {
    preview = mountPreview("see [docs](https://example.com) now", 0);
    expect(preview.view.dom.querySelector(".cm-link-text")).not.toBeNull();
  });
});

describe("image live preview", () => {
  // A trailing line gives the cursor somewhere to rest that is not the image
  // node's boundary, which would count as revealed.
  const remote = "![cat](https://example.com/c.png)\n\naway";
  const relative = "![cat](img/c.png)\n\naway";
  const awayFromRemote = remote.length;
  const awayFromRelative = relative.length;

  it("renders an img for a remote source", () => {
    preview = mountPreview(remote, awayFromRemote);
    const img = preview.view.dom.querySelector("img.cm-image");
    expect(img).toBeInstanceOf(HTMLImageElement);
    expect(img?.getAttribute("src")).toBe("https://example.com/c.png");
    expect(img?.getAttribute("alt")).toBe("cat");
  });

  it("resolves a relative source through the injected resolver", () => {
    preview = mountPreview(relative, awayFromRelative, {
      resolveAssetUrl: (src) => `asset://localhost/vault/${src}`
    });
    expect(preview.view.dom.querySelector("img.cm-image")?.getAttribute("src")).toBe(
      "asset://localhost/vault/img/c.png"
    );
  });

  it("falls back to styled alt text when the source cannot be resolved", () => {
    preview = mountPreview(relative, awayFromRelative);
    expect(preview.view.dom.querySelector("img.cm-image")).toBeNull();
    expect(preview.lineText(1)).toBe("cat");
    expect(preview.view.dom.querySelector(".cm-image-text")).not.toBeNull();
  });

  it("reveals the source when the cursor is inside the image", () => {
    preview = mountPreview("![cat](https://example.com/c.png)", 3);
    expect(preview.lineText(1)).toBe("![cat](https://example.com/c.png)");
  });
});

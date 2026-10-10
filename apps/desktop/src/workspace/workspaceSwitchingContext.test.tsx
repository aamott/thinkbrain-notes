// @vitest-environment happy-dom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useWorkspaceSwitchingContext } from "./workspaceSwitchingContext";

function Consumer() {
  useWorkspaceSwitchingContext();
  return null;
}

describe("useWorkspaceSwitchingContext", () => {
  it("throws a clear error outside a provider rather than rendering dead", () => {
    expect(() => renderToStaticMarkup(<Consumer />)).toThrow(
      /WorkspaceSwitchingContext\.Provider/
    );
  });
});

import { describe, expect, it } from "vitest";

import { classNames } from "./classNames";

describe("classNames", () => {
  it("joins truthy class names and skips empty values", () => {
    expect(classNames("tn-button", false, undefined, "tn-button--primary")).toBe(
      "tn-button tn-button--primary"
    );
  });
});

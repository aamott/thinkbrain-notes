import { describe, expect, it } from "vitest";

import { appIdentity, designTokenNames, type WorkspaceSnapshot } from "./index";

describe("core scaffold exports", () => {
  it("exposes stable application identity", () => {
    expect(appIdentity).toEqual({
      displayName: "Thinkbrain Notes",
      desktopAppId: "com.thinkbrain.notes"
    });
  });

  it("keeps design token names as CSS custom property names", () => {
    expect(designTokenNames.colorBackground).toBe("--tn-color-background");
  });

  it("supports a platform-agnostic workspace snapshot shape", () => {
    const snapshot: WorkspaceSnapshot = {
      workspace: {
        rootPath: "C:/notes",
        name: "notes"
      },
      files: [
        {
          relativePath: "Inbox.md",
          fileName: "Inbox.md",
          parentPath: "",
          byteSize: 12,
          updatedAt: null
        }
      ]
    };

    expect(snapshot.files[0]?.relativePath).toBe("Inbox.md");
  });
});

import { describe, expect, it } from "vitest";

import {
  createEditorTab,
  createFileTab,
  createVersionDiffTab
} from "../../tabs/tabModel";
import { phoneBreadcrumbs } from "./phoneBreadcrumbs";

const WORKSPACE = "Vault";
const ROOT = "/vault";

describe("phoneBreadcrumbs", () => {
  it("labels the files route", () => {
    expect(phoneBreadcrumbs({ kind: "files" }, null, WORKSPACE)).toEqual([
      WORKSPACE,
      "Files"
    ]);
  });

  it("labels a panel route with the registry label", () => {
    expect(
      phoneBreadcrumbs({ kind: "panel", panel: "search" }, null, WORKSPACE)
    ).toEqual([WORKSPACE, "Search"]);
  });

  it("falls back to the panel id when the registry has no label", () => {
    expect(
      phoneBreadcrumbs({ kind: "panel", panel: "ext.unknown" }, null, WORKSPACE)
    ).toEqual([WORKSPACE, "ext.unknown"]);
  });

  it("strips .md from a note editor's trail", () => {
    const tab = createEditorTab({ rootPath: ROOT, relativePath: "notes/Weekly.md" });
    expect(phoneBreadcrumbs({ kind: "tab", tabId: tab.id }, tab, WORKSPACE)).toEqual([
      WORKSPACE,
      "notes",
      "Weekly"
    ]);
  });

  it("keeps the extension on a code file's trail", () => {
    const tab = createFileTab({ rootPath: ROOT, relativePath: "src/main.ts" });
    expect(phoneBreadcrumbs({ kind: "tab", tabId: tab.id }, tab, WORKSPACE)).toEqual([
      WORKSPACE,
      "src",
      "main.ts"
    ]);
  });

  it("keeps the Restore segment on a restore preview", () => {
    const tab = createVersionDiffTab(
      { rootPath: ROOT, relativePath: "notes/Weekly.md" },
      "change-1"
    );
    expect(phoneBreadcrumbs({ kind: "tab", tabId: tab.id }, tab, WORKSPACE)).toEqual([
      WORKSPACE,
      "Restore",
      "notes",
      "Weekly.md"
    ]);
  });
});

import { expect, test } from "@playwright/test";

test("desktop workspace shell boots in the browser harness", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("main", { name: "ThinkBrain desktop workspace" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Open tabs" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open workspace" })).toBeVisible();
  await expect(page.getByText(/Welcome to ThinkBrain/)).toBeVisible();
});

test("activity bar toggles between the explorer and search panels", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByRole("complementary", { name: "Search panel" })).toBeVisible();
  await expect(page.getByText("This workspace surface is not connected yet.")).toBeVisible();

  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).toBeVisible();
  await expect(page.getByText("ThinkBrain will show the current folder hierarchy without changing any files.")).toBeVisible();

  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).not.toBeVisible();
  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).toBeVisible();
});

test("opens a workspace and restores the Explorer visibility and last workspace", async ({ page }) => {
  await page.addInitScript(() => {
    const settingsKey = "thinkbrain-e2e-app-settings";
    const appWindow = window as Window & {
      isTauri?: boolean;
      __TAURI_INTERNALS__?: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> };
    };
    appWindow.isTauri = true;
    appWindow.__TAURI_INTERNALS__ = {
      async invoke(command, args) {
        if (command === "plugin:dialog|open") return "/workspace/demo-vault";
        if (command === "read_app_settings") return sessionStorage.getItem(settingsKey);
        if (command === "write_app_settings") {
          sessionStorage.setItem(settingsKey, String(args.contents));
          return null;
        }
        if (command === "open_workspace") {
          return {
            workspace: { root_path: String(args.rootPath), name: "demo-vault" },
            files: []
          };
        }
        if (command === "list_workspace_entries") {
          return [
            { relative_path: "Notes", name: "Notes", parent_path: "", kind: "directory", is_markdown: false, byte_size: 0, updated_at: null },
            { relative_path: "Notes/welcome.md", name: "welcome.md", parent_path: "Notes", kind: "file", is_markdown: true, byte_size: 12, updated_at: null }
          ];
        }
        throw new Error(`Unexpected native command: ${command}`);
      }
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: "demo-vault" })).toBeVisible();
  await expect(page.getByRole("tree", { name: "demo-vault files" })).toBeVisible();
  await expect(page.getByText("welcome.md")).toBeVisible();

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).not.toBeVisible();

  await page.reload();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).not.toBeVisible();
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "demo-vault" })).toBeVisible();
  await expect(page.getByText("welcome.md")).toBeVisible();
});

test("shell exposes labelled landmarks and keyboard-accessible controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("main > header")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Open tabs" })).toBeVisible();
  await expect(page.getByRole("main", { name: "ThinkBrain desktop workspace" })).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();

  const assistant = page.getByRole("button", { name: "Assistant", exact: true });
  await assistant.focus();
  await expect(assistant).toBeFocused();

  await page.keyboard.press("Control+p");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Command palette" })).not.toBeVisible();
});

test("unavailable sections retain their owning panel", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Source control" }).click();

  await expect(page.getByRole("complementary", { name: "Source control panel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source control" })).toBeVisible();
  await expect(page.getByText("This workspace surface is not connected yet.")).toBeVisible();
});

test("assistant and bottom panel toggles preserve the editor", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible();
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible();
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Assistant" })).not.toBeVisible();

  await page.getByRole("button", { name: "Toggle bottom panel" }).click();
  await expect(page.getByRole("region", { name: "Bottom panel" })).toBeVisible();
  await expect(page.getByText("terminal panel")).toBeVisible();
  await page.getByRole("button", { name: "Close bottom panel" }).click();
  await expect(page.getByRole("region", { name: "Bottom panel" })).not.toBeVisible();
  await expect(page.getByRole("main", { name: "ThinkBrain desktop workspace" })).toBeVisible();
});

test("the editor remains usable without horizontal page overflow on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 480 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "Explorer", exact: true })).toHaveCSS("transition-duration", "0s");

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
});

import { expect, test } from "@playwright/test";

test("desktop workspace shell boots in the browser harness", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Thinkbrain Notes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible();
  await expect(page.getByText("Open a folder to list and manage Markdown notes.")).toBeVisible();
});

test("activity bar toggles between the explorer and search panels", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByRole("heading", { name: "Find notes" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search notes" })).toBeVisible();
  await expect(page.getByText("Open a folder to search your notes.")).toBeVisible();

  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible();
});

test("shell exposes labelled landmarks and keyboard-accessible icon controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("banner", { name: "Application title bar" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("contentinfo", { name: "Workspace status" })).toBeVisible();

  const verify = page.getByRole("button", { name: "Verify state wiring" });
  await verify.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Theme settings" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Explorer" })).toBeFocused();
});

test("unavailable actions announce their owning work without replacing the real panel", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Source control" }).click();

  await expect(
    page.getByRole("status", { name: /source control is owned by the git integration work/i })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible();
});

test("shell popout and bottom slots can close without displacing the editor", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "AI Assistant" }).click();
  await expect(page.getByRole("heading", { name: "AI Assistant" })).toBeVisible();
  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("heading", { name: "Workspace" })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "AI Assistant" })).toBeVisible();
  await page.getByRole("button", { name: "Close AI Assistant" }).click();
  await expect(page.getByRole("heading", { name: "AI Assistant" })).not.toBeVisible();

  await page.getByRole("button", { name: "Open bottom region" }).click();
  await expect(page.getByRole("heading", { name: "Bottom panel" })).toBeVisible();
  await page.getByRole("button", { name: "Close bottom region" }).click();
  await expect(page.getByRole("heading", { name: "Bottom panel" })).not.toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
});

test("the editor remains usable without horizontal page overflow on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 480 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "Explorer" })).toHaveCSS("transition-duration", "0s");

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
});

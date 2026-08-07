import { expect, test } from "@playwright/test";

/**
 * Exercises live preview through the demo page, which mounts the same
 * `livePreview` extension the editor uses but needs no workspace or Tauri
 * host to open a document.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/demo/live-preview.html");
  await expect(page.locator(".cm-content")).toBeVisible();
});

test("renders headings formatted and reveals their source on click", async ({ page }) => {
  const heading = page.locator(".cm-h1").first();
  await expect(heading).toHaveText("Markdown, live");

  await heading.click();
  await expect(heading).toHaveText("# Markdown, live");
});

test("reveals inline markup per node rather than per line", async ({ page }) => {
  // Anchor on text that survives revealing, since the rest of the line changes.
  const line = page.locator(".cm-line", { hasText: "as you type" }).first();
  await expect(line).toHaveText(
    "Renders bold, italic, strikethrough and inline code as you type."
  );

  // Clicking the bold run must reveal only its own markers.
  await page.getByText("bold", { exact: true }).click();
  await expect(line).toContainText("**bold**");
  await expect(line).not.toContainText("*italic*");
});

test("hides fenced code fences and highlights the block", async ({ page }) => {
  const codeLine = page.locator(".cm-code-line", { hasText: "console.log" }).first();
  await expect(codeLine).toBeVisible();
  await expect(page.locator(".cm-code-line-first").first()).toHaveText("");
});

test("renders frontmatter as a data block, not a heading", async ({ page }) => {
  const frontmatter = page.locator(".cm-frontmatter");
  await expect(frontmatter.first()).toHaveText("---");
  await expect(frontmatter.nth(1)).toHaveText("title: Live preview demo");
  // The setext mis-parse this guards against would style line 2 as an H2.
  await expect(page.locator(".cm-h2", { hasText: "title:" })).toHaveCount(0);
});

test("toggles a task checkbox from the rendered checkbox", async ({ page }) => {
  const checkbox = page.locator(".cm-task-checkbox").first();
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
});

test("shows wiki link targets and aliases", async ({ page }) => {
  const links = page.locator(".cm-link-text");
  await expect(links.filter({ hasText: "Another Note" }).first()).toBeVisible();
  await expect(links.filter({ hasText: "an aliased note" })).toHaveCount(1);
});

test("decorates a long document after scrolling to the end", async ({ page }) => {
  // CodeMirror parses long documents incrementally, so the end of this one is
  // not parsed when it opens. Note this does NOT isolate the parse-catch-up
  // path in the plugin's update guard: scrolling produces further viewport
  // measurements that would refresh the decorations anyway. It covers the
  // user-visible outcome only.
  await page.goto("/demo/live-preview.html?headings=4000");
  await expect(page.locator(".cm-content")).toBeVisible();

  await page.locator(".cm-scroller").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  const lastHeading = page.locator(".cm-h2").last();
  await expect(lastHeading).toContainText("Filler");
  await expect(lastHeading).not.toContainText("##");
});

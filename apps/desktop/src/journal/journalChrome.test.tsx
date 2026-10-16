// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JournalTrouble, type JournalTroubleCode } from "./journalChrome";
import { JOURNAL_ERROR_TITLES } from "./journalService";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (status: JournalTroubleCode): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <JournalTrouble
        status={status}
        onRetry={vi.fn()}
        onChooseFolder={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    )
  );
  return container;
};

const buttonNames = (host: HTMLElement): string[] =>
  [...host.querySelectorAll("button")].map((button) => button.textContent ?? "");

describe("JournalTrouble failure states (D63)", () => {
  // One parametrized test owns the copy contract: every code draws the title
  // the service threw with, plus the actions approved for that failure. The
  // panel and calendar surfaces only verify the copy is reachable at all.
  it.each<{ status: JournalTroubleCode; actions: string[] }>([
    { status: "no-workspace", actions: ["Open folder…"] },
    { status: "invalid-root", actions: ["Open settings"] },
    { status: "unreadable", actions: ["Retry", "Choose a different folder…"] }
  ])("draws $status with its service title and actions", async ({ status, actions }) => {
    const host = await render(status);
    expect(host.textContent).toContain(JOURNAL_ERROR_TITLES[status]);
    expect(buttonNames(host)).toEqual(actions);
  });
});

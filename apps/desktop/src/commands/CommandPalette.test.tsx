import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommandPalette } from "./CommandPalette";
import type { DesktopCommand } from "./commandRegistry";

const unavailableCommand: DesktopCommand = {
  id: "unavailable",
  title: "Unavailable command",
  intent: { type: "rebuild-index" },
  availability: "unavailable",
  unavailableMessage: "Unavailable for this workspace."
};

describe("CommandPalette", () => {
  it("uses the combobox pattern without exposing options as tab stops or disabled controls", () => {
    const markup = renderToStaticMarkup(
      <CommandPalette
        commands={[unavailableCommand]}
        files={[]}
        onClose={() => undefined}
        onCommand={() => undefined}
        onOpenFile={() => undefined}
      />
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).not.toContain("aria-disabled");
  });
});

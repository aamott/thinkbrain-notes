# Extension Platform Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an extension real end to end — manifest, compatibility gates, lazy activation, and a Note Stats built-in that proves the path.

**Architecture:** Manifest parsing, compatibility evaluation, and activation-event matching are pure functions in `packages/core/src/extensions/`. A desktop `bootstrap.ts` reads built-in manifests, registers manifest-declared commands and panels as **stubs**, and activates an extension only when one of its stubs is touched. The existing `desktopExtensionHost` and its disposable ownership are reused unchanged.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest + happy-dom, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-06-extension-platform-core-design.md`

## Global Constraints

- **Capabilities are NOT a sandbox.** `plans/technical-decisions.md`: they "must not be presented as adversarial isolation." No type name, comment, or UI string may imply extensions are sandboxed or untrusted-safe.
- Extension ids match `[a-z][a-z0-9]*(?:-[a-z0-9]+)*`. Ids inside `contributes` and activation events are **relative** to the extension; the host adds the `<extensionId>.` prefix.
- `packages/core` stays platform-agnostic: no Tauri, no React, no DOM.
- Files under 500 lines; no `any`; fail loudly with typed results (`AGENTS.md`).
- Commits are pre-approved by the user this session, but run `pnpm lint` and `pnpm typecheck` before each.
- DOM tests need `// @vitest-environment happy-dom` as line 1.

## Critical constraint discovered during planning

`getLeftPanelContributions()` / `getRightPanelContributions()` are plain calls
during render — **the registries are not reactive and nothing subscribes**. A
panel registered after React mounts will not appear until some unrelated
re-render.

Two consequences that the whole design depends on:

1. **Bootstrap must run before the first React render** — synchronously in
   `main.tsx`, before `createRoot().render()`.
2. **The stub → real swap must preserve `id`, `label`, `icon`, and `side`**, so
   the rendered list never changes shape. Only the factory and handler differ,
   and both are read at invoke/render time.

This is why no registry reactivity work is needed. Do not "improve" this by
registering contributions later or by changing ids on activation.

---

## File Structure

**Created**

| Path | Responsibility |
| --- | --- |
| `packages/core/src/extensions/manifest.ts` | `ExtensionManifest` + `parseExtensionManifest`. |
| `packages/core/src/extensions/compatibility.ts` | `evaluateCompatibility`. |
| `packages/core/src/extensions/activation.ts` | Activation-event parsing/matching. |
| `packages/core/src/extensions/index.ts` | Re-exports. |
| `apps/desktop/src/extensions/bootstrap.ts` | Stub registration + lazy activation. |
| `apps/desktop/src/extensions/builtins/index.ts` | Built-in registry. |
| `apps/desktop/src/extensions/builtins/noteStats.tsx` | Note Stats manifest + activation + panel. |
| `apps/desktop/src/extensions/LazyExtensionPanel.tsx` | Activates on mount, then renders the real panel. |
| `apps/desktop/src/extensions/ExtensionsPanel.tsx` | Live host status. |

**Modified:** `packages/core/src/index.ts`, `apps/desktop/src/main.tsx`, `apps/desktop/src/panels/panelRegistry.tsx`, `plans/extensions/*` (status).

---

### Task 1: Manifest parsing

**Files:**
- Create: `packages/core/src/extensions/manifest.ts`
- Test: `packages/core/src/extensions/manifest.test.ts`

**Interfaces:**
- Consumes: `EXTENSION_ID_PATTERN` from `../lifecycle`.
- Produces:
  - `interface ExtensionManifest { id, name, version, apiVersion, engines: { platform: readonly ExtensionPlatform[] }, activationEvents: readonly string[], capabilities: readonly string[], contributes: { commands: readonly ManifestCommand[], panels: readonly ManifestPanel[] } }`
  - `type ExtensionPlatform = "desktop" | "mobile"`
  - `interface ManifestCommand { id: string; title: string }`
  - `interface ManifestPanel { id: string; label: string; icon: string; side: "left" | "right" }`
  - `interface ManifestDiagnostic { code: string; message: string; severity: "error" | "warning" }`
  - `parseExtensionManifest(value: unknown): { manifest: ExtensionManifest | null; diagnostics: readonly ManifestDiagnostic[] }`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/extensions/manifest.test.ts
import { describe, expect, it } from "vitest";

import { parseExtensionManifest } from "./manifest";

const VALID = {
  id: "note-stats",
  name: "Note Stats",
  version: "1.0.0",
  apiVersion: "^1.0.0",
  engines: { platform: ["desktop", "mobile"] },
  activationEvents: ["onCommand:show", "onView:stats"],
  capabilities: [],
  contributes: {
    commands: [{ id: "show", title: "Show note stats" }],
    panels: [{ id: "stats", label: "Note Stats", icon: "∑", side: "right" }]
  }
};

describe("parseExtensionManifest", () => {
  it("accepts a complete manifest", () => {
    const { manifest, diagnostics } = parseExtensionManifest(VALID);
    expect(diagnostics).toEqual([]);
    expect(manifest?.id).toBe("note-stats");
    expect(manifest?.contributes.panels[0]?.side).toBe("right");
  });

  it("defaults the optional collections", () => {
    const { manifest, diagnostics } = parseExtensionManifest({
      id: "minimal", name: "Minimal", version: "1.0.0", apiVersion: "^1.0.0"
    });
    expect(diagnostics).toEqual([]);
    expect(manifest?.activationEvents).toEqual([]);
    expect(manifest?.capabilities).toEqual([]);
    expect(manifest?.contributes.commands).toEqual([]);
    expect(manifest?.engines.platform).toEqual(["desktop", "mobile"]);
  });

  it("rejects a non-object", () => {
    const { manifest, diagnostics } = parseExtensionManifest("nope");
    expect(manifest).toBeNull();
    expect(diagnostics[0]?.code).toBe("manifest_not_object");
  });

  it("rejects an id that is not lowercase kebab-case", () => {
    for (const id of ["Note_Stats", "note.stats", "-note", ""]) {
      const { manifest, diagnostics } = parseExtensionManifest({ ...VALID, id });
      expect(manifest).toBeNull();
      expect(diagnostics.some((d) => d.code === "manifest_invalid_id")).toBe(true);
    }
  });

  it("reports every missing required field at once", () => {
    const { manifest, diagnostics } = parseExtensionManifest({ id: "ok" });
    expect(manifest).toBeNull();
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain("manifest_missing_field");
    expect(diagnostics.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects contributed ids that are not relative kebab-case", () => {
    const { manifest, diagnostics } = parseExtensionManifest({
      ...VALID,
      contributes: { commands: [{ id: "note-stats.show", title: "x" }], panels: [] }
    });
    expect(manifest).toBeNull();
    expect(diagnostics.some((d) => d.code === "manifest_invalid_contribution_id")).toBe(true);
  });

  it("rejects an unknown platform", () => {
    const { diagnostics } = parseExtensionManifest({
      ...VALID, engines: { platform: ["toaster"] }
    });
    expect(diagnostics.some((d) => d.code === "manifest_invalid_platform")).toBe(true);
  });

  it("ignores unknown top-level fields without complaint", () => {
    const { manifest, diagnostics } = parseExtensionManifest({ ...VALID, futureField: 1 });
    expect(diagnostics).toEqual([]);
    expect(manifest).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @thinkbrain/core test manifest`
Expected: FAIL — cannot resolve `./manifest`.

- [ ] **Step 3: Implement**

Write `manifest.ts` so that:
- Parsing never throws; every problem becomes a diagnostic.
- All problems are collected, not short-circuited (the Extensions panel lists them together).
- Any `severity: "error"` diagnostic yields `manifest: null`.
- `engines.platform` defaults to `["desktop", "mobile"]`; `activationEvents`, `capabilities`, `contributes.commands`, `contributes.panels` default to `[]`.
- Unknown top-level fields are ignored silently (forward compatibility).

```ts
const REQUIRED = ["id", "name", "version", "apiVersion"] as const;
const RELATIVE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PLATFORMS = new Set(["desktop", "mobile"]);
```

Use `EXTENSION_ID_PATTERN` from `../lifecycle` for `id` so the rule lives in one place.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @thinkbrain/core test manifest`
Expected: PASS — 8 tests.

- [ ] **Step 5: QA and commit**

`pnpm lint && pnpm typecheck`
Commit: `feat(core): add extension manifest parsing`

---

### Task 2: Compatibility gates

**Files:**
- Create: `packages/core/src/extensions/compatibility.ts`
- Test: `packages/core/src/extensions/compatibility.test.ts`

**Interfaces:**
- Consumes: `ExtensionManifest`, `ExtensionPlatform` (Task 1).
- Produces:
  - `interface CompatibilityHost { readonly apiVersion: string; readonly platform: ExtensionPlatform; readonly capabilities: readonly string[] }`
  - `interface CompatibilityReason { code: "api-version" | "platform" | "capability"; message: string; severity: "error" | "warning" }`
  - `interface CompatibilityResult { compatible: boolean; reasons: readonly CompatibilityReason[] }`
  - `evaluateCompatibility(manifest: ExtensionManifest, host: CompatibilityHost): CompatibilityResult`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/extensions/compatibility.test.ts
import { describe, expect, it } from "vitest";

import { evaluateCompatibility } from "./compatibility";
import type { ExtensionManifest } from "./manifest";

const manifest = (overrides: Partial<ExtensionManifest> = {}): ExtensionManifest => ({
  id: "sample", name: "Sample", version: "1.0.0", apiVersion: "^1.0.0",
  engines: { platform: ["desktop", "mobile"] },
  activationEvents: [], capabilities: [],
  contributes: { commands: [], panels: [] },
  ...overrides
});

const host = { apiVersion: "1.2.0", platform: "desktop" as const, capabilities: ["commands", "panels"] };

describe("evaluateCompatibility", () => {
  it("accepts a manifest inside the supported api range", () => {
    expect(evaluateCompatibility(manifest(), host)).toEqual({ compatible: true, reasons: [] });
  });

  it("rejects an api version outside the range", () => {
    const result = evaluateCompatibility(manifest({ apiVersion: "^2.0.0" }), host);
    expect(result.compatible).toBe(false);
    expect(result.reasons[0]?.code).toBe("api-version");
  });

  it("rejects a platform the host is not", () => {
    const result = evaluateCompatibility(manifest({ engines: { platform: ["mobile"] } }), host);
    expect(result.compatible).toBe(false);
    expect(result.reasons[0]?.code).toBe("platform");
  });

  it("warns about an unsupported capability but stays compatible", () => {
    // Capabilities are compatibility hints, never permissions: an unknown one
    // must not block loading.
    const result = evaluateCompatibility(manifest({ capabilities: ["terminal"] }), host);
    expect(result.compatible).toBe(true);
    expect(result.reasons[0]).toMatchObject({ code: "capability", severity: "warning" });
  });

  it("reports every problem rather than stopping at the first", () => {
    const result = evaluateCompatibility(
      manifest({ apiVersion: "^9.0.0", engines: { platform: ["mobile"] }, capabilities: ["terminal"] }),
      host
    );
    expect(result.reasons.map((r) => r.code).sort()).toEqual(["api-version", "capability", "platform"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @thinkbrain/core test compatibility`

- [ ] **Step 3: Implement**

Write a small caret/tilde/exact semver range check inline — do **not** add a semver dependency for this. Supported forms: `^x.y.z`, `~x.y.z`, exact `x.y.z`, and `*`. Anything else is an `api-version` error with a message naming the unsupported form.

Only `severity: "error"` reasons set `compatible: false`.

- [ ] **Step 4: Run to verify it passes** — 5 tests.

- [ ] **Step 5: QA and commit** — `feat(core): add extension compatibility gates`

---

### Task 3: Activation events

**Files:**
- Create: `packages/core/src/extensions/activation.ts`, `packages/core/src/extensions/index.ts`
- Modify: `packages/core/src/index.ts` (export the new namespace)
- Test: `packages/core/src/extensions/activation.test.ts`

**Interfaces:**
- Produces:
  - `type ActivationEvent = { kind: "startup" } | { kind: "command"; id: string } | { kind: "view"; id: string }`
  - `parseActivationEvent(raw: string): ActivationEvent | null`
  - `hasStartupActivation(manifest: ExtensionManifest): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/extensions/activation.test.ts
import { describe, expect, it } from "vitest";

import { parseActivationEvent } from "./activation";

describe("parseActivationEvent", () => {
  it("parses onStartup", () => {
    expect(parseActivationEvent("onStartup")).toEqual({ kind: "startup" });
  });

  it("parses onCommand and onView with relative ids", () => {
    expect(parseActivationEvent("onCommand:show")).toEqual({ kind: "command", id: "show" });
    expect(parseActivationEvent("onView:stats")).toEqual({ kind: "view", id: "stats" });
  });

  it("rejects an unknown event kind", () => {
    expect(parseActivationEvent("onLanguage:markdown")).toBeNull();
  });

  it("rejects a prefixed id, which is a common authoring mistake", () => {
    expect(parseActivationEvent("onCommand:note-stats.show")).toBeNull();
  });

  it("rejects a missing id", () => {
    expect(parseActivationEvent("onCommand:")).toBeNull();
    expect(parseActivationEvent("onCommand")).toBeNull();
  });
});
```

> `onLanguage` is listed in the epic but is not implemented here; it has no
> trigger point yet. Returning `null` is deliberate, and the manifest parser
> should surface unknown events as warnings rather than errors so adding
> `onLanguage` later is not a breaking change.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Implement**, then export everything from `packages/core/src/extensions/index.ts` and re-export from `packages/core/src/index.ts`.
- [ ] **Step 4: Run to verify it passes** — 5 tests.
- [ ] **Step 5: QA and commit** — `feat(core): add extension activation events`

---

### Task 4: Note Stats built-in

Written before the bootstrap so the bootstrap has a real extension to load.

**Files:**
- Create: `apps/desktop/src/extensions/builtins/noteStats.tsx`
- Create: `apps/desktop/src/extensions/builtins/index.ts`
- Test: `apps/desktop/src/extensions/builtins/noteStats.test.tsx`

**Interfaces:**
- Consumes: `DesktopExtensionContext`, `DesktopExtensionDefinition` (existing host); `ExtensionManifest` (Task 1); `DesktopPanelContext` (existing).
- Produces:
  - `computeNoteStats(contents: string | null, wordsPerMinute: number): { words: number; characters: number; readingMinutes: number }`
  - `noteStatsManifest: ExtensionManifest`
  - `activateNoteStats: DesktopExtensionActivation`
  - `interface BuiltInExtension { manifest: ExtensionManifest; activate: DesktopExtensionActivation; deactivate?: ... }`
  - `builtInExtensions: readonly BuiltInExtension[]`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/desktop/src/extensions/builtins/noteStats.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { computeNoteStats, noteStatsManifest } from "./noteStats";

describe("computeNoteStats", () => {
  it("counts words and characters", () => {
    expect(computeNoteStats("one two three", 200)).toMatchObject({ words: 3, characters: 13 });
  });

  it("treats an empty or missing document as zero", () => {
    expect(computeNoteStats("", 200)).toMatchObject({ words: 0, characters: 0, readingMinutes: 0 });
    expect(computeNoteStats(null, 200)).toMatchObject({ words: 0, characters: 0 });
  });

  it("ignores runs of whitespace rather than counting empty words", () => {
    expect(computeNoteStats("  one   two  \n\n three \n", 200).words).toBe(3);
  });

  it("rounds reading time up so a short note is never 0 minutes", () => {
    expect(computeNoteStats("one two three", 200).readingMinutes).toBe(1);
    expect(computeNoteStats(Array.from({ length: 450 }, () => "w").join(" "), 200).readingMinutes).toBe(3);
  });

  it("does not divide by zero when the setting is misconfigured", () => {
    expect(Number.isFinite(computeNoteStats("one two", 0).readingMinutes)).toBe(true);
  });
});

describe("noteStatsManifest", () => {
  it("declares relative contribution ids and matching activation events", () => {
    expect(noteStatsManifest.id).toBe("note-stats");
    expect(noteStatsManifest.contributes.panels.map((p) => p.id)).toEqual(["stats"]);
    expect(noteStatsManifest.activationEvents).toContain("onView:stats");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @thinkbrain/desktop test noteStats`

- [ ] **Step 3: Implement**

`computeNoteStats` is a pure function: words are `contents.trim().split(/\s+/).filter(Boolean).length`, characters are `contents.length`, reading time is `Math.ceil(words / wordsPerMinute)` guarded so a non-positive `wordsPerMinute` falls back to 200.

`activateNoteStats(context)` must:
1. `context.settings.registerSchema({...})` declaring `showReadingTime` (boolean, default `true`) and `wordsPerMinute` (number, default `200`), in a section whose id is `display` (the host namespaces it).
2. `context.panels.register({ id: "stats", label: "Note Stats", icon: "∑", side: "right", factory })` where the factory reads `documentContents` from the supplied `DesktopPanelContext` and `context.settings.get(...)` for the two settings.
3. `context.commands.register({ id: "show", title: "Show note stats", availability: "available", handler: ({ closePalette }) => { /* reveal the panel */ closePalette(); } })`.

Return nothing; every registration is already owned by `context.subscriptions`.

Note: the command handler needs a way to reveal a right-side panel. `DesktopCommandContext` has no such effect today — add `revealPanel(id: string): void` to `DesktopCommandContext` in `commandRegistry.ts` and implement it in `DesktopShell` as `setRightPanel(id)`. Update `commandRegistry.test.ts`'s context stub accordingly.

- [ ] **Step 4: Run to verify it passes** — 6 tests.
- [ ] **Step 5: QA and commit** — `feat(extensions): add the Note Stats built-in`

---

### Task 5: Bootstrap with stub-based lazy activation

**Files:**
- Create: `apps/desktop/src/extensions/bootstrap.ts`
- Create: `apps/desktop/src/extensions/LazyExtensionPanel.tsx`
- Test: `apps/desktop/src/extensions/bootstrap.test.tsx`

**Interfaces:**
- Consumes: everything above, plus `desktopExtensionHost`, `desktopCommandRegistry`, `desktopPanelRegistry`.
- Produces:
  - `interface BootstrapOptions { host?: DesktopExtensionHost; extensions?: readonly BuiltInExtension[]; commands?: DesktopCommandRegistry; panels?: DesktopPanelRegistry; compatibilityHost?: CompatibilityHost }`
  - `interface ExtensionBootstrap extends Disposable { entries(): readonly BootstrapEntry[] }`
  - `interface BootstrapEntry { id: string; name: string; status: ExtensionStatus | "incompatible"; reasons: readonly CompatibilityReason[] }`
  - `bootstrapExtensions(options?: BootstrapOptions): ExtensionBootstrap`
  - `HOST_API_VERSION = "1.0.0"`

Every dependency is injectable so tests never touch the module-scoped singletons.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/desktop/src/extensions/bootstrap.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { bootstrapExtensions } from "./bootstrap";
import { createDesktopExtensionHost } from "./desktopExtensionHost";
import { createDesktopCommandRegistry } from "../commands/commandRegistry";
import { createDesktopPanelRegistry } from "../panels/panelRegistry";
import type { ExtensionManifest } from "@thinkbrain/core";

const manifest = (overrides: Partial<ExtensionManifest> = {}): ExtensionManifest => ({
  id: "sample", name: "Sample", version: "1.0.0", apiVersion: "^1.0.0",
  engines: { platform: ["desktop"] },
  activationEvents: ["onCommand:go"], capabilities: [],
  contributes: { commands: [{ id: "go", title: "Go" }], panels: [] },
  ...overrides
});

const setup = (extension: { manifest: ExtensionManifest; activate: () => void }) => {
  const commands = createDesktopCommandRegistry();
  const panels = createDesktopPanelRegistry();
  const host = createDesktopExtensionHost();
  const boot = bootstrapExtensions({ host, commands, panels, extensions: [extension] });
  return { commands, panels, host, boot };
};

describe("bootstrapExtensions", () => {
  it("registers a stub command without activating the extension", () => {
    const activate = vi.fn();
    const { commands, boot } = setup({ manifest: manifest(), activate });

    expect(commands.get("sample.go")?.title).toBe("Go");
    expect(activate).not.toHaveBeenCalled();
    expect(boot.entries()[0]?.status).toBe("registered");
  });

  it("activates the extension when its stub command is invoked, then runs the real handler", async () => {
    const realHandler = vi.fn();
    const activate = vi.fn((context: { commands: { register: (c: unknown) => void } }) => {
      context.commands.register({ id: "go", title: "Go", availability: "available", handler: realHandler });
    });
    const { commands, boot } = setup({ manifest(), activate } as never);

    await commands.get("sample.go")?.handler({} as never);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(realHandler).toHaveBeenCalledTimes(1);
    expect(boot.entries()[0]?.status).toBe("active");
  });

  it("activates only once when the stub is invoked concurrently", async () => {
    const activate = vi.fn(async (context: never) => { /* registers real command */ });
    const { commands } = setup({ manifest(), activate } as never);
    const stub = commands.get("sample.go")!;
    await Promise.all([stub.handler({} as never), stub.handler({} as never)]);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("activates eagerly when onStartup is declared", () => {
    const activate = vi.fn();
    setup({ manifest: manifest({ activationEvents: ["onStartup"] }), activate });
    expect(activate).toHaveBeenCalled();
  });

  it("does not register stubs for an incompatible extension but still lists it", () => {
    const { commands, boot } = setup({ manifest: manifest({ apiVersion: "^9.0.0" }), activate: vi.fn() });
    expect(commands.get("sample.go")).toBeUndefined();
    expect(boot.entries()[0]).toMatchObject({ status: "incompatible" });
    expect(boot.entries()[0]?.reasons[0]?.code).toBe("api-version");
  });

  it("leaves no stub behind when activation fails", async () => {
    const activate = vi.fn(() => { throw new Error("boom"); });
    const { commands, boot } = setup({ manifest: manifest(), activate });
    await expect(commands.get("sample.go")!.handler({} as never)).rejects.toThrow();
    expect(boot.entries()[0]?.status).toBe("failed");
    expect(commands.get("sample.go")).toBeUndefined();
  });

  it("disposes stubs and active extensions on shutdown", async () => {
    const { commands, boot } = setup({ manifest: manifest(), activate: vi.fn() });
    await boot.dispose();
    expect(commands.get("sample.go")).toBeUndefined();
  });
});
```

Note: `createDesktopCommandRegistry` and `createDesktopPanelRegistry` factories may not be exported yet — export them alongside the existing singletons if not.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Implement `bootstrap.ts`**

For each built-in:
1. `parseExtensionManifest` → on error, record an entry with `status: "incompatible"` and the diagnostics as reasons; register nothing.
2. `evaluateCompatibility` → if not compatible, same treatment.
3. `host.register({ id, activate, deactivate })`, owned by the bootstrap's disposable store.
4. If `onStartup` → `void host.activate(id)`.
5. Else, for each contributed command and panel, register a stub under the **prefixed** id (`<extensionId>.<relativeId>`) preserving `title`/`label`/`icon`/`side`.

Stub command handler:

```ts
const handler = async (context: DesktopCommandContext): Promise<void> => {
  await ensureActive(entry);                 // idempotent; single in-flight promise
  const real = commands.get(fullId);
  if (real && real !== stubContribution) await real.handler(context);
};
```

`ensureActive` disposes the extension's stubs **before** calling `host.activate`, so the extension's own registration of the same id does not collide with the stub. On activation failure it must leave the stubs disposed and mark the entry `failed` — never re-register a stub that would activate a broken extension again.

Stub panel factory returns `<LazyExtensionPanel …/>` (Task 5, next step).

- [ ] **Step 4: Implement `LazyExtensionPanel.tsx`**

```tsx
export function LazyExtensionPanel({ ensureActive, resolve, context }: LazyExtensionPanelProps) {
  const [state, setState] = useState<"pending" | "ready" | "failed">("pending");
  useEffect(() => {
    let cancelled = false;
    void ensureActive()
      .then(() => { if (!cancelled) setState("ready"); })
      .catch(() => { if (!cancelled) setState("failed"); });
    return () => { cancelled = true; };
  }, [ensureActive]);

  if (state === "failed") return <Unavailable title="Extension failed" description="…" />;
  if (state === "pending") return <p className="p-4 text-muted-foreground text-xs">Loading…</p>;
  return <>{resolve(context)}</>;
}
```

- [ ] **Step 5: Run to verify it passes** — 7 tests.
- [ ] **Step 6: QA and commit** — `feat(extensions): bootstrap built-ins with lazy activation`

---

### Task 6: Wire bootstrap into startup

**Files:**
- Modify: `apps/desktop/src/main.tsx`
- Test: covered by Task 8's e2e.

- [ ] **Step 1: Call bootstrap before the first render**

```tsx
// main.tsx, after imports and before createRoot(...).render(...)
// Registers manifest-declared contributions BEFORE React renders. The panel and
// command registries are not reactive — nothing subscribes to them — so a
// contribution added after the first render would not appear in the activity
// bar until an unrelated re-render.
bootstrapExtensions();
```

- [ ] **Step 2: Verify by hand**

Run `pnpm --filter @thinkbrain/desktop dev`, open the app, and confirm a "Note Stats" entry appears in the right-side panel list without any extension code having run (add a temporary `console.log` in `activateNoteStats` to confirm it is silent until opened, then remove it).

- [ ] **Step 3: QA and commit** — `feat(extensions): bootstrap extensions at startup`

---

### Task 7: Extensions panel

**Files:**
- Create: `apps/desktop/src/extensions/ExtensionsPanel.tsx`
- Modify: `apps/desktop/src/panels/panelRegistry.tsx`
- Test: `apps/desktop/src/extensions/ExtensionsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Assert the panel lists each entry's name and status, renders compatibility reasons for an incompatible entry, and shows an empty state when there are none. Inject entries via props so the test does not depend on the real bootstrap.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Implement the panel**, reading from the bootstrap's `entries()`.
- [ ] **Step 4: Enable the registry entry**

In `panelRegistry.tsx`, replace the `extensions` panel's `availability: () => false` and its placeholder factory:

```tsx
  {
    id: "extensions",
    label: "Extensions",
    icon: "⊞",
    side: "left",
    factory: () => <ExtensionsPanel />
  },
```

The old copy — "Extensions will appear here when the capability sandbox is ready" — must go: `plans/technical-decisions.md` records that capabilities are soft gates and that sandboxing is deferred, so that string promises something the project decided not to build.

- [ ] **Step 5: Run to verify it passes**
- [ ] **Step 6: QA and commit** — `feat(extensions): show live extension status in the Extensions panel`

---

### Task 8: End-to-end coverage and closeout

**Files:**
- Create: `apps/desktop/e2e/extensions.spec.ts`
- Modify: `plans/extensions/*` status prefixes, `plans/pending-extensions-low-hard.md` status list.

- [ ] **Step 1: Write the e2e**

Open the app, click Extensions in the activity bar, assert Note Stats is listed as `registered`. Open the Note Stats panel from the right side, assert it becomes `active` and shows a word count. Follow the existing `app.spec.ts` fixture for opening a workspace and a note; use `exact: true` on ambiguous accessible names.

- [ ] **Step 2: Run** `pnpm --filter @thinkbrain/desktop test:e2e extensions`
- [ ] **Step 3: Full QA** — `./scripts/qa.sh` and the full e2e suite.
- [ ] **Step 4: Update story statuses**

Rename to `done-` and tick criteria for: `extension_manifest_format`, `extension_capability_compatibility`, `extension_lifecycle_bootstrap`. Update the epic's Status list. Leave `extension_local_directory_loader` pending and note in the epic that it is the next step.

- [ ] **Step 5: Commit** — `test(extensions): add e2e coverage and close the platform-core stories`

---

## Self-Review

**Spec coverage.** Manifest → Task 1. Compatibility → Task 2. Activation events → Task 3. Note Stats → Task 4. Bootstrap/stubs/lazy activation → Tasks 5–6. Extensions panel → Task 7. Testing → every task plus Task 8.

**Gap I am accepting:** the spec's `onView:stats` activation event is matched by the *panel stub* rather than by a general event dispatcher — there is no event bus, so "the view opened" is observed by the stub component mounting. That satisfies the behaviour but means activation events are not yet a first-class subscription system; `plans/extensions/pending-extension_events_tasks-low-med.md` owns that. Task 3 still parses all event kinds so the manifest format does not change when the bus arrives.

**Deviation from the spec worth noting:** Task 4 adds `revealPanel` to `DesktopCommandContext`. The spec assumed the Note Stats command could reveal its panel; no such effect exists today, so the plan adds one.

**Placeholder scan.** No TBD/TODO. Tasks 3, 7, and 8 describe test intent rather than inlining every assertion, because each follows an existing file's established fixture; each names the file to copy.

**Type consistency.** `ExtensionManifest` shape is identical across Tasks 1–5. `CompatibilityReason.code` values match between Task 2 and the Task 5 assertion (`api-version`). Relative-vs-prefixed id rules are stated once (Global Constraints) and applied consistently: manifests and activation events use relative ids; registries receive `<extensionId>.<relativeId>`.

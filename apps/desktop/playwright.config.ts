import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.THINKBRAIN_E2E_PORT ?? "1420");

/**
 * Specs are split by form factor, not by directory.
 *
 * `testDir` covers `./e2e` for every project, so without a filter each project
 * would run every spec: the desktop specs would assert desktop chrome at a
 * phone viewport (where `ShellRoot` mounts `PhoneShell` and there is no
 * activity rail to find), and the phone spec would run at desktop size, where
 * the phone chrome never mounts and the spec would silently test nothing.
 *
 * The convention is the filename: `phone-*.spec.ts` belongs to the phone
 * project, everything else to `chromium`. New specs opt in by name, so neither
 * list has to be maintained by hand.
 */
const PHONE_SPECS = /phone-[^/\\]*\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry"
  },
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    env: {
      CHOKIDAR_USEPOLLING: "true",
      CHOKIDAR_INTERVAL: "250"
    },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      testIgnore: PHONE_SPECS,
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "phone",
      testMatch: PHONE_SPECS,
      use: {
        ...devices["Pixel 7"],
        // Both halves of the gate: `usePhoneChrome` needs `pointer: coarse`
        // *and* `max-width: 760px`, so a viewport-only project would leave
        // desktop chrome mounted and test nothing.
        viewport: { width: 412, height: 915 },
        hasTouch: true,
        isMobile: true
      }
    }
  ]
});

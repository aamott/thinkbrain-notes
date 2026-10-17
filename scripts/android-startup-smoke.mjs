#!/usr/bin/env node
/**
 * android-startup-smoke — cold-launch smoke test for the installed ThinkBrain
 * Notes Android app.
 *
 * Tests the INSTALLED package only: never installs, uninstalls, clears app
 * data, or touches log buffers.
 *
 * Usage:
 *   node scripts/android-startup-smoke.mjs   (or `pnpm android:smoke`)
 *
 * Environment:
 *   ANDROID_SERIAL   device/emulator serial (default: adb picks the single
 *                    connected device; set when more than one is attached)
 *
 * Exits 0 when two consecutive cold launches each yield a stable process for
 * 10s; exits 1 immediately with the failing launch's evidence otherwise.
 */
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PKG = "com.thinkbrain.notes";
const ACTIVITY = `${PKG}/.MainActivity`;
const LAUNCHES = 2;
const STABLE_SECONDS = 10;
const LOG_TAIL = 300;
const ADB_TIMEOUT_MS = 30_000;

const deviceArgs = process.env.ANDROID_SERIAL
  ? ["-s", process.env.ANDROID_SERIAL]
  : [];

function adb(...args) {
  try {
    return execFileSync("adb", [...deviceArgs, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: ADB_TIMEOUT_MS,
    }).trim();
  } catch (err) {
    // `pidof` exits 1 when the process is absent — that is data, not failure.
    // Anything else (device offline, signal, timeout, adb itself missing) is
    // an execution error and must not be masked as "no process".
    if (
      args[0] === "shell" &&
      args[1] === "pidof" &&
      err.status === 1 &&
      !err.signal &&
      !err.stderr?.trim()
    ) {
      return "";
    }
    throw new Error(`adb ${args.join(" ")} failed: ${err.message}`, {
      cause: err,
    });
  }
}

function logcatTail() {
  try {
    return adb("logcat", "-d", "-t", String(LOG_TAIL));
  } catch (err) {
    return `(logcat retrieval failed: ${err.message})`;
  }
}

function fail(launch, reason, amOutput, pidHistory) {
  console.error(
    `FAIL launch ${launch}/${LAUNCHES}: ${reason}\n` +
      `am output: ${amOutput}\n` +
      `pid history: ${pidHistory.join(", ") || "(none)"}\n` +
      `--- logcat tail ---\n${logcatTail()}`,
  );
  process.exit(1);
}

for (let launch = 1; launch <= LAUNCHES; launch++) {
  adb("shell", "am", "force-stop", PKG);
  const amOutput = adb("shell", "am", "start", "-W", "-n", ACTIVITY);
  if (/^Error\b/m.test(amOutput)) {
    fail(launch, "am start reported an error", amOutput, []);
  }

  // Sample the PID now, then once per second for STABLE_SECONDS — including
  // the final interval — so a crash at any point is caught.
  const pidHistory = [adb("shell", "pidof", PKG) || "DEAD"];
  const firstPid = pidHistory[0];
  let dead = firstPid === "DEAD";
  for (let s = 0; s < STABLE_SECONDS && !dead; s++) {
    await delay(1000);
    const pid = adb("shell", "pidof", PKG);
    pidHistory.push(pid || "DEAD");
    if (!pid || pid !== firstPid) {
      dead = true;
    }
  }
  if (dead) {
    fail(
      launch,
      firstPid === "DEAD"
        ? "process never started"
        : "process died or restarted",
      amOutput,
      pidHistory,
    );
  }
  console.log(
    `launch ${launch}/${LAUNCHES}: pid ${firstPid} stable ${STABLE_SECONDS}s`,
  );
}

console.log("PASS");

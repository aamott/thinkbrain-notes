/**
 * Soft compatibility gates for extensions.
 *
 * These are compatibility checks and documentation, NOT a security boundary.
 * A loaded extension is trusted local code running with app privileges;
 * capability declarations describe intent and let the host warn about features
 * it cannot provide. Nothing here isolates anything.
 */

import type { ExtensionManifest, ExtensionPlatform } from "./manifest";

/** What the running host offers, for a manifest to be checked against. */
export interface CompatibilityHost {
  /** Concrete host API version, e.g. "1.2.0". */
  readonly apiVersion: string;
  readonly platform: ExtensionPlatform;
  readonly capabilities: readonly string[];
}

export interface CompatibilityReason {
  readonly code: "api-version" | "platform" | "capability";
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface CompatibilityResult {
  readonly compatible: boolean;
  readonly reasons: readonly CompatibilityReason[];
}

interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/** Pushes a compatibility reason onto the supplied list. */
const addReason = (
  reasons: CompatibilityReason[],
  code: CompatibilityReason["code"],
  message: string,
  severity: CompatibilityReason["severity"]
): void => {
  reasons.push({ code, message, severity });
};

function parseVersion(value: string): SemanticVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

const atLeast = (version: SemanticVersion, floor: SemanticVersion): boolean => {
  if (version.major !== floor.major) return version.major > floor.major;
  if (version.minor !== floor.minor) return version.minor > floor.minor;
  return version.patch >= floor.patch;
};

/**
 * Evaluates a narrow semver range against a concrete version.
 *
 * Supports `*`, exact `x.y.z`, `^x.y.z`, and `~x.y.z`. Anything richer returns
 * `null` so the caller reports an unsupported range instead of guessing at the
 * author's intent.
 */
function satisfies(version: SemanticVersion, range: string): boolean | null {
  const trimmed = range.trim();
  if (trimmed === "*") return true;

  const operator = trimmed.startsWith("^") ? "^" : trimmed.startsWith("~") ? "~" : "";
  const floor = parseVersion(operator ? trimmed.slice(1) : trimmed);
  if (!floor) return null;

  if (operator === "^") {
    return version.major === floor.major && atLeast(version, floor);
  }
  if (operator === "~") {
    return version.major === floor.major && version.minor === floor.minor && atLeast(version, floor);
  }
  return version.major === floor.major && version.minor === floor.minor && version.patch === floor.patch;
}

/**
 * Checks a manifest against the running host.
 *
 * Every problem is reported rather than stopping at the first, so a host can
 * show an author the full picture. Only `error` reasons make an extension
 * incompatible; capability mismatches are warnings and never block loading.
 */
export function evaluateCompatibility(
  manifest: ExtensionManifest,
  host: CompatibilityHost
): CompatibilityResult {
  const reasons: CompatibilityReason[] = [];

  const hostVersion = parseVersion(host.apiVersion);
  if (!hostVersion) {
    addReason(
      reasons,
      "api-version",
      `Host api version "${host.apiVersion}" is not a valid semantic version.`,
      "error"
    );
  } else {
    const result = satisfies(hostVersion, manifest.apiVersion);
    if (result === null) {
      addReason(
        reasons,
        "api-version",
        `Unsupported apiVersion range "${manifest.apiVersion}". Use *, x.y.z, ^x.y.z, or ~x.y.z.`,
        "error"
      );
    } else if (!result) {
      addReason(
        reasons,
        "api-version",
        `Requires host api ${manifest.apiVersion}, but this host is ${host.apiVersion}.`,
        "error"
      );
    }
  }

  if (!manifest.engines.platform.includes(host.platform)) {
    addReason(
      reasons,
      "platform",
      `Supports ${manifest.engines.platform.join(", ")}, but this host is ${host.platform}.`,
      "error"
    );
  }

  for (const capability of manifest.capabilities) {
    if (!host.capabilities.includes(capability)) {
      addReason(
        reasons,
        "capability",
        `Capability "${capability}" is unavailable on this host; features using it may not work.`,
        "warning"
      );
    }
  }

  return {
    compatible: !reasons.some((reason) => reason.severity === "error"),
    reasons
  };
}

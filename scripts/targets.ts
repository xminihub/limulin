/**
 * The single target table: every release artifact name, npm platform package
 * name and bun compile target is derived from here (ADR-0001). Vocabulary is
 * the npm convention (os darwin|linux|win32, cpu arm64|x64) — linux-aarch64
 * and windows-x64 are retired for new releases.
 */

export const BINARY_NAME = "lim";
export const PKG_PREFIX = "limulin";

export const TARGETS = [
  {
    name: "darwin-arm64",
    bunTarget: "bun-darwin-arm64",
    pkgName: "limulin-darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    binary: "lim",
  },
  {
    name: "darwin-x64",
    bunTarget: "bun-darwin-x64",
    pkgName: "limulin-darwin-x64",
    os: "darwin",
    cpu: "x64",
    binary: "lim",
  },
  {
    name: "linux-arm64",
    bunTarget: "bun-linux-aarch64",
    pkgName: "limulin-linux-arm64",
    os: "linux",
    cpu: "arm64",
    binary: "lim",
  },
  {
    name: "linux-x64",
    bunTarget: "bun-linux-x64",
    pkgName: "limulin-linux-x64",
    os: "linux",
    cpu: "x64",
    binary: "lim",
  },
  {
    name: "win32-x64",
    bunTarget: "bun-windows-x64",
    pkgName: "limulin-win32-x64",
    os: "win32",
    cpu: "x64",
    binary: "lim.exe",
  },
] as const;

export type Target = (typeof TARGETS)[number];
export type TargetName = Target["name"];

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function findTarget(name: string): Target {
  const found = TARGETS.find((t) => t.name === name);
  if (!found) {
    throw new Error(
      `not a target: ${name} (expected ${TARGETS.map((t) => t.name).join(", ")})`,
    );
  }
  return found;
}

export function targetNames(): TargetName[] {
  return TARGETS.map((t) => t.name);
}

/** Standalone binary release asset, e.g. lim-1.2.3-win32-x64.exe. */
export function binaryAssetName(version: string, name: string): string {
  if (!SEMVER.test(version)) {
    throw new Error(`not a release version: ${version}`);
  }
  const t = findTarget(name);
  return `${BINARY_NAME}-${version}-${t.name}${t.os === "win32" ? ".exe" : ""}`;
}

export type ChecksumEntry = { file: string; sha256: string };

/** SHA256SUMS body: sorted by file name, `<sum><2 spaces><file>` lines. */
export function formatSha256Sums(entries: readonly ChecksumEntry[]): string {
  return [...entries]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map((e) => `${e.sha256}  ${e.file}\n`)
    .join("");
}

/** lim-latest.txt body: the bare version string. */
export function versionFileContent(version: string): string {
  if (!SEMVER.test(version)) {
    throw new Error(`not a release version: ${version}`);
  }
  return `${version}\n`;
}

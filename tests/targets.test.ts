import { describe, expect, test } from "bun:test";
import {
  BINARY_NAME,
  TARGETS,
  binaryAssetName,
  formatSha256Sums,
  targetNames,
  versionFileContent,
} from "../scripts/targets";

// Locks the npm-convention vocabulary decided in spec #4 / ADR-0001:
// linux-arm64 (not linux-aarch64), win32-x64 (not windows-x64).
describe("target table", () => {
  test("the five targets use npm os/cpu names", () => {
    expect(targetNames()).toEqual([
      "darwin-arm64",
      "darwin-x64",
      "linux-arm64",
      "linux-x64",
      "win32-x64",
    ]);
  });

  test("each target carries its bun compile target and package name", () => {
    const byName = Object.fromEntries(TARGETS.map((t) => [t.name, t]));
    expect(byName["darwin-arm64"]).toMatchObject({
      bunTarget: "bun-darwin-arm64",
      pkgName: "limulin-darwin-arm64",
      os: "darwin",
      cpu: "arm64",
      binary: "lim",
    });
    expect(byName["darwin-x64"]).toMatchObject({
      bunTarget: "bun-darwin-x64",
      pkgName: "limulin-darwin-x64",
      os: "darwin",
      cpu: "x64",
      binary: "lim",
    });
    expect(byName["linux-arm64"]).toMatchObject({
      bunTarget: "bun-linux-aarch64",
      pkgName: "limulin-linux-arm64",
      os: "linux",
      cpu: "arm64",
      binary: "lim",
    });
    expect(byName["linux-x64"]).toMatchObject({
      bunTarget: "bun-linux-x64",
      pkgName: "limulin-linux-x64",
      os: "linux",
      cpu: "x64",
      binary: "lim",
    });
    expect(byName["win32-x64"]).toMatchObject({
      bunTarget: "bun-windows-x64",
      pkgName: "limulin-win32-x64",
      os: "win32",
      cpu: "x64",
      binary: "lim.exe",
    });
  });

  test("binary release asset names embed the version", () => {
    expect(binaryAssetName("1.2.3", "linux-arm64")).toBe(
      "lim-1.2.3-linux-arm64",
    );
    expect(binaryAssetName("1.2.3", "win32-x64")).toBe(
      "lim-1.2.3-win32-x64.exe",
    );
  });

  test("unknown target names are rejected", () => {
    expect(() => binaryAssetName("1.2.3", "linux-aarch64")).toThrow(
      /not a target/,
    );
  });

  test("BINARY_NAME is lim everywhere", () => {
    expect(BINARY_NAME).toBe("lim");
    for (const t of TARGETS) expect(t.binary.startsWith("lim")).toBe(true);
  });
});

describe("release manifest helpers", () => {
  test("SHA256SUMS lines sort by file name with sumplus-double-space format", () => {
    const text = formatSha256Sums([
      { file: "lim-1.0.0-linux-x64", sha256: "aa11" },
      { file: "lim-1.0.0-darwin-arm64", sha256: "bb22" },
      { file: "lim-1.0.0-linux-x64.tar.gz", sha256: "cc33" },
    ]);
    expect(text).toBe(
      "bb22  lim-1.0.0-darwin-arm64\n" +
        "aa11  lim-1.0.0-linux-x64\n" +
        "cc33  lim-1.0.0-linux-x64.tar.gz\n",
    );
  });

  test("lim-latest.txt holds the bare version with a trailing newline", () => {
    expect(versionFileContent("0.4.0")).toBe("0.4.0\n");
  });
});

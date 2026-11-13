import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mainManifest,
  platformManifests,
  writePackages,
} from "../scripts/npm-packages";
import { TARGETS } from "../scripts/targets";

describe("npm package manifests (generated at publish time)", () => {
  test("launcher manifest is bin-only with exact-pinned platform deps", () => {
    const m = mainManifest({
      version: "0.4.0",
      description: "lim — a tui for dsh and others",
      repository: "git+https://github.com/xminihub/limulin.git",
      homepage: "https://github.com/xminihub/limulin#readme",
      license: "MIT",
    });
    expect(m).toMatchObject({
      name: "limulin",
      version: "0.4.0",
      bin: { lim: "./bin/lim.cjs" },
      files: ["bin/lim.cjs", "README.md"],
      license: "MIT",
    });
    expect(m.optionalDependencies).toEqual({
      "limulin-darwin-arm64": "0.4.0",
      "limulin-darwin-x64": "0.4.0",
      "limulin-linux-arm64": "0.4.0",
      "limulin-linux-x64": "0.4.0",
      "limulin-win32-x64": "0.4.0",
    });
    // Retired fields from the JS-bundle era must not leak back in.
    expect(m).not.toHaveProperty("engines");
    expect(m).not.toHaveProperty("main");
    expect(m).not.toHaveProperty("module");
    expect(m).not.toHaveProperty("exports");
    expect(m).not.toHaveProperty("dependencies");
  });

  test("platform manifests carry the os/cpu fields npm prunes on", () => {
    const ms = platformManifests({
      version: "0.4.0",
      description: "lim — the limulin binary for one platform",
      repository: "git+https://github.com/xminihub/limulin.git",
      license: "MIT",
    });
    expect(ms).toHaveLength(TARGETS.length);
    expect(
      ms
        .map((m) => [
          String(m.name),
          m.os as string[],
          m.cpu as string[],
          m.files as string[],
        ])
        .sort((a, b) => ((a[0] ?? "") < (b[0] ?? "") ? -1 : 1)),
    ).toEqual([
      ["limulin-darwin-arm64", ["darwin"], ["arm64"], ["lim"]],
      ["limulin-darwin-x64", ["darwin"], ["x64"], ["lim"]],
      ["limulin-linux-arm64", ["linux"], ["arm64"], ["lim"]],
      ["limulin-linux-x64", ["linux"], ["x64"], ["lim"]],
      ["limulin-win32-x64", ["win32"], ["x64"], ["lim.exe"]],
    ]);
    for (const m of ms) expect(m.version).toBe("0.4.0");
  });

  test("writePackages lays down six publishable package dirs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lim-npm-"));
    const binDir = join(dir, "binaries");
    const out = join(dir, "npm");

    const { binaryAssetName } = await import("../scripts/targets");
    await Bun.write(join(binDir, "stub"), "x");
    const binaries: Record<string, string> = {};
    for (const t of TARGETS) {
      const p = join(binDir, binaryAssetName("0.4.0", t.name));
      await Bun.write(p, `stub for ${t.name}`);
      binaries[t.name] = p;
    }

    const launcherStub = join(dir, "lim.cjs");
    await Bun.write(launcherStub, "// LIM_BIN_PATH override stub\n");

    const written = await writePackages({
      version: "0.4.0",
      binaries,
      launcherPath: launcherStub,
      outDir: out,
    });

    expect(written.sort()).toEqual([
      "limulin",
      "limulin-darwin-arm64",
      "limulin-darwin-x64",
      "limulin-linux-arm64",
      "limulin-linux-x64",
      "limulin-win32-x64",
    ]);

    const launcherManifest = JSON.parse(
      await readFile(join(out, "limulin/package.json"), "utf8"),
    );
    expect(launcherManifest.name).toBe("limulin");
    expect(await readFile(join(out, "limulin/bin/lim.cjs"), "utf8")).toContain(
      "LIM_BIN_PATH",
    );

    const winManifest = JSON.parse(
      await readFile(join(out, "limulin-win32-x64/package.json"), "utf8"),
    );
    expect(winManifest.os).toEqual(["win32"]);
    expect(await readFile(join(out, "limulin-win32-x64/lim.exe"), "utf8")).toBe(
      "stub for win32-x64",
    );
  });
});

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { repoRoot, runProcess } from "./helpers";

const DIST = resolve(repoRoot, "dist/lim.js");

// The dist bundle is a build artifact; skip cleanly when it hasn't been
// built yet (plain `bun test` on a fresh checkout builds nothing).
const built = existsSync(DIST);
const maybe = built ? test : test.skip;

for (const runtime of ["node", "bun"] as const) {
  describe(`lim dist bundle (${runtime})`, () => {
    maybe("--version prints the package version", async () => {
      const { code, out } = await runProcess(runtime, [DIST, "--version"]);
      expect(code).toBe(0);
      const pkg = await import(resolve(repoRoot, "package.json"));
      expect(out.trim()).toBe(pkg.version);
    });

    maybe("--help prints usage and exits 0", async () => {
      const { code, out } = await runProcess(runtime, [DIST, "--help"]);
      expect(code).toBe(0);
      expect(out).toContain("Usage:");
      expect(out).toContain("lim --help");
    });

    maybe(
      "unknown option is a usage error on stderr with non-zero exit",
      async () => {
        const { code, err } = await runProcess(runtime, [DIST, "--bogus"]);
        expect(code).not.toBe(0);
        expect(err).toContain("unknown option --bogus");
      },
    );
  });
}

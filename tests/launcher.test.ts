import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot, runProcess } from "./helpers";

// Seam 1 (spec #4): the shipped launcher bin, run under node as a black box
// against a temp tree whose node_modules holds a stub platform package.
const launcherSrc = join(repoRoot, "bin/lim.cjs");
const hostTarget = `${process.platform}-${process.arch}`;
const maybe = process.platform === "win32" ? test.skip : test;

async function fixture(stubBody: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "lim-launcher-"));
  const pkgDir = join(dir, "node_modules", `limulin-${hostTarget}`);
  const binDir = join(dir, "bin");
  await Bun.write(join(binDir, "lim.cjs"), await Bun.file(launcherSrc).text());
  await Bun.write(
    join(pkgDir, "package.json"),
    JSON.stringify({ name: `limulin-${hostTarget}`, version: "0.0.0" }),
  );
  const stub = join(pkgDir, "lim");
  await writeFile(stub, `#!/bin/sh\n${stubBody}\n`);
  await chmod(stub, 0o755);
  return binDir;
}

async function removePlatformPackage(binDir: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(join(binDir, "..", "node_modules", `limulin-${hostTarget}`), {
    recursive: true,
  });
}

function runNode(dir: string, args: string[], env?: Record<string, string>) {
  return runProcess("node", [join(dir, "lim.cjs"), ...args], { env });
}

describe("lim npm launcher", () => {
  maybe(
    "passes argv, stdout and stderr through to the platform binary",
    async () => {
      const dir = await fixture('echo "out:$1 $2"; echo "err:$1" >&2; exit 3');
      const { code, out, err } = await runNode(dir, ["--foo", "bar"]);
      expect(code).toBe(3);
      expect(out).toContain("out:--foo bar");
      expect(err).toContain("err:--foo");
    },
  );

  maybe("the platform binary answers --version (no interception)", async () => {
    const dir = await fixture("echo 9.9.9-stub");
    const { code, out } = await runNode(dir, ["--version"]);
    expect(code).toBe(0);
    expect(out.trim()).toBe("9.9.9-stub");
  });

  maybe(
    "missing platform package fails with the host target and raw-binary hint",
    async () => {
      const dir = await fixture("echo never");
      await removePlatformPackage(dir);
      const { code, err } = await runNode(dir, []);
      expect(code).not.toBe(0);
      expect(err).toContain(hostTarget);
      expect(err).toContain("github.com/xminihub/limulin/releases");
    },
  );

  maybe("LIM_BIN_PATH overrides platform-package resolution", async () => {
    const dir = await fixture("echo from-package");
    const other = join(dir, "elsewhere");
    await Bun.write(other, "");
    await writeFile(other, "#!/bin/sh\necho from-env\n");
    await chmod(other, 0o755);
    const { code, out } = await runNode(dir, [], { LIM_BIN_PATH: other });
    expect(code).toBe(0);
    expect(out.trim()).toBe("from-env");
  });

  maybe("a LIM_BIN_PATH that points at nothing is a hard error", async () => {
    const dir = await fixture("echo from-package");
    const { code, err } = await runNode(dir, [], {
      LIM_BIN_PATH: join(dir, "does-not-exist"),
    });
    expect(code).not.toBe(0);
    expect(err).toContain("LIM_BIN_PATH");
    expect(err).toContain("does-not-exist");
  });
});

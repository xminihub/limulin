import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const ENTRY = resolve(ROOT, "src/index.ts");

function runCli(args: string[]) {
  return Bun.spawn(["bun", "run", ENTRY, ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, LIMULIN_TEST_HEADLESS: "1" },
  });
}

describe("limulin cli", () => {
  test("--version prints the package version", async () => {
    const proc = runCli(["--version"]);
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    expect(code).toBe(0);
    const pkg = await import(resolve(ROOT, "package.json"));
    expect(out.trim()).toBe(pkg.version);
  });

  test("--help prints usage and exits 0", async () => {
    const proc = runCli(["--help"]);
    const out = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(out).toContain("Usage:");
    expect(out).toContain("limulin --help");
  });

  test("unknown option is a usage error on stderr with non-zero exit", async () => {
    const proc = runCli(["--bogus"]);
    const err = await new Response(proc.stderr).text();
    expect(await proc.exited).not.toBe(0);
    expect(err).toContain("unknown option --bogus");
  });
});

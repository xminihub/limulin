import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const ENTRY = resolve(ROOT, "src/index.ts");

type RunResult = { code: number; out: string; err: string };

async function runCli(args: string[]): Promise<RunResult> {
  const proc = Bun.spawn(["bun", "run", ENTRY, ...args], {
    cwd: ROOT,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
}

describe("limulin cli", () => {
  test("--version prints the package version", async () => {
    const { code, out } = await runCli(["--version"]);
    expect(code).toBe(0);
    const pkg = await import(resolve(ROOT, "package.json"));
    expect(out.trim()).toBe(pkg.version);
  });

  test("--help prints usage and exits 0", async () => {
    const { code, out } = await runCli(["--help"]);
    expect(code).toBe(0);
    expect(out).toContain("Usage:");
    expect(out).toContain("limulin --help");
  });

  test("unknown option is a usage error on stderr with non-zero exit", async () => {
    const { code, err } = await runCli(["--bogus"]);
    expect(code).not.toBe(0);
    expect(err).toContain("unknown option --bogus");
  });

  test("extra arguments are rejected as a usage error", async () => {
    const { code, err } = await runCli(["--help", "extra"]);
    expect(code).not.toBe(0);
    expect(err).toContain("limulin:");
  });
});

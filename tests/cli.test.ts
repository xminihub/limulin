import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { repoRoot, runProcess, type RunResult } from "./helpers";

const ENTRY = resolve(repoRoot, "src/index.ts");

async function runCli(
  args: string[],
  env?: Record<string, string>,
): Promise<
  ReturnType<typeof runProcess> extends never
    ? never
    : Awaited<ReturnType<typeof runProcess>>
> {
  return runProcess("bun", ["run", ENTRY, ...args], { env });
}

describe("limulin cli", () => {
  test("--version prints the package version", async () => {
    const { code, out } = await runCli(["--version"]);
    expect(code).toBe(0);
    const pkg = await import(resolve(repoRoot, "package.json"));
    expect(out.trim()).toBe(pkg.version);
  });

  test("--version prints the injected build-time version when present", async () => {
    const { code, out } = await runCli(["--version"], {
      LIMULIN_VERSION: "9.9.9-injected",
    });
    expect(code).toBe(0);
    expect(out.trim()).toBe("9.9.9-injected");
  });

  test("--help prints usage and exits 0", async () => {
    const { code, out } = await runCli(["--help"]);
    expect(code).toBe(0);
    expect(out).toContain("Usage:");
    expect(out).toContain("lim --help");
  });

  test("unknown option is a usage error on stderr with non-zero exit", async () => {
    const { code, err } = await runCli(["--bogus"]);
    expect(code).not.toBe(0);
    expect(err).toContain("unknown option --bogus");
  });

  test("extra arguments are rejected as a usage error", async () => {
    const { code, err } = await runCli(["--help", "extra"]);
    expect(code).not.toBe(0);
    expect(err).toContain("lim:");
  });
});

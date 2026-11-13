import { describe, expect, test } from "bun:test";
import {
  BREW_TARGETS,
  assetName,
  packageTarball,
  parseTarget,
} from "../scripts/homebrew";
import { runProcess } from "./helpers";
import { statSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function fixture(bytes: Uint8Array, target = "darwin-arm64") {
  const dir = await mkdtemp(join(tmpdir(), "lim-hb-"));
  const binary = join(dir, `lim-0.3.2-${target}`);
  await writeFile(binary, bytes);
  return { dir, binary };
}

function mustRun(cmd: string[]): void {
  const proc = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} failed: ${proc.stderr.toString()}`);
  }
}

function tarList(file: string): string[] {
  const proc = Bun.spawnSync(["tar", "-tf", file], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`tar -tf ${file} failed: ${proc.stderr.toString()}`);
  }
  return proc.stdout
    .toString()
    .split("\n")
    .filter((line) => line.length > 0);
}

/** What the system tar reports about the member: mode, owner and timestamp. */
function tarListing(file: string): string {
  const proc = Bun.spawnSync(["tar", "-tvzf", file], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`tar -tvzf ${file} failed: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString();
}

async function systemSha256(file: string): Promise<string> {
  for (const tool of ["sha256sum", "shasum -a 256"]) {
    const proc = Bun.spawnSync(
      ["sh", "-c", `${tool} ${JSON.stringify(file)}`],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    if (proc.exitCode === 0) {
      return proc.stdout.toString().trim().split(/\s+/)[0]!;
    }
  }
  throw new Error("no sha256 tool available");
}

describe("homebrew asset naming", () => {
  test("one versioned tarball asset is named per brew target", () => {
    expect(assetName("0.3.2", "darwin-arm64")).toBe(
      "lim-0.3.2-darwin-arm64.tar.gz",
    );
    expect(assetName("0.3.2", "darwin-x64")).toBe(
      "lim-0.3.2-darwin-x64.tar.gz",
    );
    expect(assetName("0.3.2", "linux-x64")).toBe("lim-0.3.2-linux-x64.tar.gz");
    expect(assetName("0.3.2", "linux-aarch64")).toBe(
      "lim-0.3.2-linux-aarch64.tar.gz",
    );
  });

  test("the bare binary is not a tarball asset", () => {
    expect(assetName("0.3.2", "linux-x64")).not.toBe("lim-0.3.2-linux-x64");
  });

  test("every brew target the tap generates blocks for is packaged", () => {
    expect([...BREW_TARGETS].sort()).toEqual([
      "darwin-arm64",
      "darwin-x64",
      "linux-aarch64",
      "linux-x64",
    ]);
  });

  test("an asset name never carries the release tag's v prefix", () => {
    expect(assetName("1.10.0", "darwin-arm64")).toBe(
      "lim-1.10.0-darwin-arm64.tar.gz",
    );
  });

  test("a version that is not a release version is refused", () => {
    expect(() => assetName("v1.2.3", "darwin-arm64")).toThrow(
      "not a release version",
    );
    expect(() => assetName("", "darwin-arm64")).toThrow(
      "not a release version",
    );
  });

  test("a target outside the brew targets is refused", () => {
    expect(() => parseTarget("windows-x64")).toThrow("not a homebrew target");
    expect(() => parseTarget("darwin-arm65")).toThrow("not a homebrew target");
    expect(() => parseTarget("")).toThrow("not a homebrew target");
  });

  test("parseTarget accepts each brew target unchanged", () => {
    for (const target of BREW_TARGETS) {
      expect(parseTarget(target)).toBe(target);
    }
  });
});

describe("homebrew tarball packaging", () => {
  test("the hash the tap computes is the tarball's own sha256", async () => {
    const { dir, binary } = await fixture(new TextEncoder().encode("payload"));
    const result = await packageTarball({
      binary,
      version: "0.3.2",
      target: "darwin-arm64",
      outDir: dir,
    });

    expect(result.sha256).toBe(await systemSha256(result.path));
  });

  test("the packaged member is named lim, not the asset name", async () => {
    const { dir, binary } = await fixture(new TextEncoder().encode("payload"));
    const result = await packageTarball({
      binary,
      version: "0.3.2",
      target: "linux-x64",
      outDir: dir,
    });

    expect(result.asset).toBe("lim-0.3.2-linux-x64.tar.gz");
    expect(tarList(result.path)).toEqual(["lim"]);
  });

  test("the member is executable and owned by uid/gid 0", async () => {
    const { dir, binary } = await fixture(new TextEncoder().encode("payload"));
    const result = await packageTarball({
      binary,
      version: "0.3.2",
      target: "darwin-arm64",
      outDir: dir,
    });

    const unpacked = await mkdtemp(join(tmpdir(), "lim-unpack-"));
    mustRun(["tar", "-xzf", result.path, "-C", unpacked]);
    expect(statSync(join(unpacked, "lim")).mode & 0o777).toBe(0o755);

    // Owner and timestamp are invisible to an unprivileged extraction, so read
    // them off tar's listing. Implementations render both differently (bsdtar
    // "0 0"/"Jan  1  1970", GNU "0/0"/"1970-01-01 00:00").
    const listing = tarListing(result.path);
    expect(listing).toMatch(/0\/0|\s0\s+0\s/);
    expect(listing).toMatch(/1970-01-01 00:00|Jan\s+1\s+1970/);
  });

  test("the packaged member is the binary byte-for-byte", async () => {
    const payload = new TextEncoder().encode("signed mach-o bytes");
    const { dir, binary } = await fixture(payload);
    const result = await packageTarball({
      binary,
      version: "0.3.2",
      target: "darwin-x64",
      outDir: dir,
    });

    const unpacked = await mkdtemp(join(tmpdir(), "lim-unpack-"));
    mustRun(["tar", "-xzf", result.path, "-C", unpacked]);
    expect(
      new Uint8Array(await readFile(join(unpacked, "lim"))),
    ).toEqual(payload);
  });

  test("packaging the same bytes twice is byte-identical across targets", async () => {
    const payload = new TextEncoder().encode("reproducible payload");
    const { dir, binary } = await fixture(payload);
    const first = await packageTarball({
      binary,
      version: "0.3.2",
      target: "linux-aarch64",
      outDir: dir,
    });
    const second = await packageTarball({
      binary,
      version: "0.3.2",
      target: "linux-aarch64",
      outDir: dir,
    });

    expect(second.sha256).toBe(first.sha256);
    expect(await readFile(second.path)).toEqual(await readFile(first.path));
  });
});

describe("homebrew packaging cli", () => {
  test("package reports the asset and its hash as json", async () => {
    const { dir, binary } = await fixture(new TextEncoder().encode("payload"));
    const run = await runProcess("bun", [
      "run",
      "scripts/homebrew.ts",
      "package",
      "--binary",
      binary,
      "--version",
      "0.3.2",
      "--dir",
      dir,
    ]);

    expect(run.code).toBe(0);
    const reported = JSON.parse(run.out);
    expect(reported.asset).toBe("lim-0.3.2-darwin-arm64.tar.gz");
    expect(reported.path).toBe(join(dir, reported.asset));
    expect(reported.sha256).toBe(await systemSha256(reported.path));
  });

  test("package --target selects the target's asset name", async () => {
    const { dir, binary } = await fixture(new TextEncoder().encode("payload"));
    const run = await runProcess("bun", [
      "run",
      "scripts/homebrew.ts",
      "package",
      "--binary",
      binary,
      "--version",
      "0.3.2",
      "--target",
      "linux-x64",
      "--dir",
      dir,
    ]);

    expect(run.code).toBe(0);
    const reported = JSON.parse(run.out);
    expect(reported.asset).toBe("lim-0.3.2-linux-x64.tar.gz");
    expect(tarList(reported.path)).toEqual(["lim"]);
  });

  test("package rejects a target Homebrew has no block for", async () => {
    const { dir, binary } = await fixture(new TextEncoder().encode("payload"));
    const run = await runProcess("bun", [
      "run",
      "scripts/homebrew.ts",
      "package",
      "--binary",
      binary,
      "--version",
      "0.3.2",
      "--target",
      "windows-x64",
      "--dir",
      dir,
    ]);

    expect(run.code).not.toBe(0);
    expect(run.err).toContain("not a homebrew target");
  });

  test("package requires the binary, version and output directory", async () => {
    for (const args of [
      ["--version", "0.3.2", "--dir", "/tmp"],
      ["--binary", "/tmp/lim", "--dir", "/tmp"],
      ["--binary", "/tmp/lim", "--version", "0.3.2"],
    ]) {
      const run = await runProcess("bun", [
        "run",
        "scripts/homebrew.ts",
        "package",
        ...args,
      ]);
      expect(run.code).not.toBe(0);
      expect(run.err).toContain("is required");
    }
  });

  test("the tap renders formulae, not this script", async () => {
    const run = await runProcess("bun", [
      "run",
      "scripts/homebrew.ts",
      "render",
      "--version",
      "0.3.2",
      "--sha256",
      "0".repeat(64),
    ]);

    expect(run.code).not.toBe(0);
    expect(run.err).toContain("unknown command");
  });
});

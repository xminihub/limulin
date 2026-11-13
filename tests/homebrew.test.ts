import { describe, expect, test } from "bun:test";
import {
  renderFormula,
  assetName,
  downloadUrl,
  packageTarball,
} from "../scripts/homebrew";
import { runProcess } from "./helpers";
import { statSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function fixture(bytes: Uint8Array) {
  const dir = await mkdtemp(join(tmpdir(), "lim-hb-"));
  const binary = join(dir, "lim-0.3.2-darwin-arm64");
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

describe("homebrew tarball packaging", () => {
  test("the hash the formula gets is the tarball's own sha256", async () => {
    const { dir, binary } = await fixture(new TextEncoder().encode("payload"));
    const result = await packageTarball({
      binary,
      version: "0.3.2",
      outDir: dir,
    });

    expect(result.sha256).toBe(await systemSha256(result.path));
  });

  test("the archive Homebrew downloads holds a member named lim", async () => {
    const { dir, binary } = await fixture(new TextEncoder().encode("payload"));
    const result = await packageTarball({
      binary,
      version: "0.3.2",
      outDir: dir,
    });

    expect(result.asset).toBe("lim-0.3.2-darwin-arm64.tar.gz");
    expect(tarList(result.path)).toEqual(["lim"]);

    // Owner and timestamp are invisible to an unprivileged extraction, so read
    // them off tar's listing. Implementations render both differently
    // (bsdtar "0 0"/"Jan  1  1970", GNU "0/0"/"1970-01-01 00:00").
    const listing = tarListing(result.path);
    expect(listing).toMatch(/0\/0|\s0\s+0\s/);
    expect(listing).toMatch(/1970-01-01 00:00|Jan\s+1\s+1970/);
  });

  test("the packaged member is the binary byte-for-byte and stays executable", async () => {
    const payload = new TextEncoder().encode("signed mach-o bytes");
    const { dir, binary } = await fixture(payload);
    const result = await packageTarball({
      binary,
      version: "0.3.2",
      outDir: dir,
    });

    const unpacked = await mkdtemp(join(tmpdir(), "lim-unpack-"));
    mustRun(["tar", "-xzf", result.path, "-C", unpacked]);

    const member = join(unpacked, "lim");
    const packed = new Uint8Array(await Bun.file(member).arrayBuffer());
    expect(Array.from(packed)).toEqual(Array.from(payload));
    expect(statSync(member).mode & 0o777).toBe(0o755);
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
    expect(JSON.parse(run.out)).toEqual({
      asset: "lim-0.3.2-darwin-arm64.tar.gz",
      path: join(dir, "lim-0.3.2-darwin-arm64.tar.gz"),
      sha256: expect.any(String),
    });
  });

  test("repackaging the same binary hashes the same, so a rerun cannot disagree", async () => {
    const payload = new TextEncoder().encode("signed mach-o bytes");
    const { dir, binary } = await fixture(payload);
    const args = (outDir: string) => [
      "run",
      "scripts/homebrew.ts",
      "package",
      "--binary",
      binary,
      "--version",
      "0.3.2",
      "--dir",
      outDir,
    ];

    const first = await runProcess("bun", args(dir));
    const second = await runProcess(
      "bun",
      args(await mkdtemp(join(tmpdir(), "lim-hb2-"))),
    );

    expect(first.code).toBe(0);
    expect(JSON.parse(second.out).sha256).toBe(JSON.parse(first.out).sha256);
  });
});

const KNOWN_SHA =
  "6cf8a7c1e0b9d3f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f901234";

describe("homebrew formula rendering", () => {
  test("the formula pins the released tarball and its hash", async () => {
    const formula = await renderFormula({
      version: "0.3.2",
      sha256: KNOWN_SHA,
    });

    expect(formula).toContain("class Lim < Formula");
    expect(formula).toContain('version "0.3.2"');
    expect(formula).toContain(
      'url "https://github.com/xminihub/limulin/releases/download/v0.3.2/lim-0.3.2-darwin-arm64.tar.gz"',
    );
    expect(formula).toContain(`sha256 "${KNOWN_SHA}"`);
    expect(formula).toContain('bin.install "lim"');
  });

  test("the template's url and the packaged asset never disagree", async () => {
    const formula = await renderFormula({
      version: "1.4.7",
      sha256: KNOWN_SHA,
    });
    const url = formula.match(/^  url "(.+)"$/m)![1]!;

    expect(url.endsWith(`/${assetName("1.4.7")}`)).toBe(true);
    expect(url).toBe(downloadUrl("1.4.7"));
  });
});

describe("homebrew input guards", () => {
  test("a version that is not a release version is refused", () => {
    expect(() => assetName("v1.2.3")).toThrow("not a release version");
    expect(() => assetName("1.2")).toThrow("not a release version");
  });

  test("the cli writes nothing when the hash is unusable", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lim-hb-guard-"));
    const out = join(dir, "lim.rb");
    const run = await runProcess("bun", [
      "run",
      "scripts/homebrew.ts",
      "render",
      "--version",
      "0.3.2",
      "--sha256",
      "nope",
      "--out",
      out,
    ]);

    expect(run.code).toBe(1);
    expect(run.err).toContain("not a sha256");
    expect(await Bun.file(out).exists()).toBe(false);
  });

  test("a sha256 that is not 64 hex digits is refused", async () => {
    await expect(
      renderFormula({ version: "0.3.2", sha256: "deadbeef" }),
    ).rejects.toThrow("not a sha256");
    await expect(
      renderFormula({ version: "0.3.2", sha256: `${KNOWN_SHA.slice(0, 63)}z` }),
    ).rejects.toThrow("not a sha256");
  });

  test("render emits identical bytes to stdout and to --out", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lim-hb-render-"));
    const out = join(dir, "lim.rb");
    const base = [
      "run",
      "scripts/homebrew.ts",
      "render",
      "--version",
      "0.3.2",
      "--sha256",
      KNOWN_SHA,
    ];

    const written = await runProcess("bun", [...base, "--out", out]);
    const printed = await runProcess("bun", base);

    expect(written.code).toBe(0);
    expect(printed.code).toBe(0);
    expect(printed.out).toBe(await readFile(out, "utf8"));
  });

  test("a formula rendered from a bad version is refused", async () => {
    await expect(
      renderFormula({ version: "v1.2.3", sha256: KNOWN_SHA }),
    ).rejects.toThrow("not a release version");
  });
});

describe("homebrew asset naming", () => {
  test("the tap asset is a versioned darwin-arm64 tarball", () => {
    expect(assetName("0.3.2")).toBe("lim-0.3.2-darwin-arm64.tar.gz");
  });

  test("the formula download URL points at the release tag and asset", () => {
    expect(downloadUrl("0.3.2")).toBe(
      "https://github.com/xminihub/limulin/releases/download/v0.3.2/lim-0.3.2-darwin-arm64.tar.gz",
    );
  });

  test("a two-digit version still hashes into the right URL", () => {
    expect(downloadUrl("1.10.0")).toBe(
      "https://github.com/xminihub/limulin/releases/download/v1.10.0/lim-1.10.0-darwin-arm64.tar.gz",
    );
  });
});

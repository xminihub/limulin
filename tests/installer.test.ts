import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot, runProcess, type RunResult } from "./helpers";

// Seam 1 (spec #4): install.sh run with a sandboxed HOME against a local
// fixture release tree (the LIM_INSTALL_BASE directory mode), asserting
// placement, PATH/rc handling, checksums and overwrite policy.
const INSTALL_SH = join(repoRoot, "install.sh");
const VERSION = "9.9.9";
const OLD_VERSION = "9.9.8";

function hostTarget(): string {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${os}-${arch}`;
}

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

function stubBinary(version: string): string {
  return `#!/bin/sh\necho ${version}\n`;
}

async function releaseFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "lim-release-"));
  const target = hostTarget();
  const entries: { file: string; bytes: Uint8Array }[] = [];

  const latest = new TextEncoder().encode(`${VERSION}\n`);
  await writeFile(join(dir, "lim-latest.txt"), latest);

  for (const v of [VERSION, OLD_VERSION]) {
    const file = `lim-${v}-${target}`;
    const bytes = new TextEncoder().encode(stubBinary(v));
    await writeFile(join(dir, file), bytes);
    await chmod(join(dir, file), 0o755);
    entries.push({ file, bytes });
  }
  const sums = entries
    .sort((a, b) => (a.file < b.file ? -1 : 1))
    .map((e) => `${sha256(e.bytes)}  ${e.file}\n`)
    .join("");
  await writeFile(join(dir, "SHA256SUMS"), sums);
  return dir;
}

type Run = {
  home: string;
  result: RunResult;
  path: string;
};

async function runInstaller(
  args: string[],
  overrides: {
    base?: string;
    pathExtra?: string;
    existingLim?: string;
    shell?: string;
    home?: string;
  } = {},
): Promise<Run> {
  const home = overrides.home ?? (await mkdtemp(join(tmpdir(), "lim-home-")));
  await mkdir(join(home, ".local", "bin"), { recursive: true });
  if (overrides.existingLim !== undefined) {
    const f = join(home, ".local", "bin", "lim");
    await writeFile(f, overrides.existingLim);
    await chmod(f, 0o755);
  }
  const rcLine = overrides.shell?.includes("zsh") ? ".zshrc" : ".bashrc";
  await writeFile(join(home, rcLine), "# keep me\n");

  const base = overrides.base ?? (await releaseFixture());
  const path =
    (overrides.pathExtra ? `${overrides.pathExtra}:` : "") + "/usr/bin:/bin";
  const env: Record<string, string> = {
    HOME: home,
    PATH: path,
    SHELL: overrides.shell ?? "/bin/bash",
    LIM_INSTALL_BASE: base,
  };
  const result = await runProcess("bash", [INSTALL_SH, ...args], { env });
  return { home, result, path };
}

const limPath = (home: string) => join(home, ".local", "bin", "lim");

describe("lim installer", () => {
  test("installs the latest verified binary into ~/.local/bin and lists it on PATH", async () => {
    const { home, result } = await runInstaller([]);
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    const run = await runProcess(limPath(home), ["--version"]);
    expect(run.out.trim()).toBe(VERSION);
    const rc = await Bun.file(join(home, ".bashrc")).text();
    expect(rc).toContain("# keep me");
    expect(rc).toContain(".local/bin");
    expect(rc.match(/\.local\/bin/g)?.length).toBe(1);
  });

  test("re-installing over lim's own binary replaces silently", async () => {
    const { home, result } = await runInstaller([], {
      existingLim: stubBinary("0.0.1"),
    });
    expect(result.code).toBe(0);
    const run = await runProcess(limPath(home), ["--version"]);
    expect(run.out.trim()).toBe(VERSION);
  });

  test("refuses a foreign lim without --force", async () => {
    const { result } = await runInstaller([], {
      existingLim: "#!/bin/sh\nexit 3\n",
    });
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("already exists");
  });

  test("--force replaces a foreign lim", async () => {
    const { home, result } = await runInstaller(["--force"], {
      existingLim: "#!/bin/sh\nexit 3\n",
    });
    expect(result.code).toBe(0);
    const run = await runProcess(limPath(home), ["--version"]);
    expect(run.out.trim()).toBe(VERSION);
  });

  test("checksum mismatch fails closed and places nothing", async () => {
    const base = await releaseFixture();
    const sums = await Bun.file(join(base, "SHA256SUMS")).text();
    await writeFile(
      join(base, "SHA256SUMS"),
      sums.replace(/^[0-9a-f]{6}/gm, "000000"),
    );
    const { home, result } = await runInstaller([], { base });
    expect(result.code).not.toBe(0);
    const exists = await Bun.file(limPath(home)).exists();
    expect(exists).toBe(false);
  });

  test("--version pins an older release", async () => {
    const { home, result } = await runInstaller(["--version", OLD_VERSION]);
    expect(result.code).toBe(0);
    const run = await runProcess(limPath(home), ["--version"]);
    expect(run.out.trim()).toBe(OLD_VERSION);
  });

  test("--no-modify-path leaves the rc file untouched", async () => {
    const { home, result } = await runInstaller(["--no-modify-path"]);
    expect(result.code).toBe(0);
    const rc = await Bun.file(join(home, ".bashrc")).text();
    expect(rc).toBe("# keep me\n");
  });

  test("does not edit rc when ~/.local/bin is already on PATH", async () => {
    const home = await mkdtemp(join(tmpdir(), "lim-home-"));
    const { result } = await runInstaller([], {
      home,
      pathExtra: join(home, ".local", "bin"),
    });
    expect(result.code).toBe(0);
    const rc = await Bun.file(join(home, ".bashrc")).text();
    expect(rc).toBe("# keep me\n");
  });

  test("an unknown flag is refused rather than ignored", async () => {
    const { home, result } = await runInstaller(["--froce"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("unknown option");
    const exists = await Bun.file(limPath(home)).exists();
    expect(exists).toBe(false);
  });

  test("--binary installs a local file without downloading", async () => {
    const local = join(await mkdtemp(join(tmpdir(), "lim-local-")), "lim");
    await writeFile(local, stubBinary("7.7.7-from-source"));
    await chmod(local, 0o755);
    const { home, result } = await runInstaller([
      "--binary",
      local,
      "--no-modify-path",
    ]);
    expect(result.code).toBe(0);
    const run = await runProcess(limPath(home), ["--version"]);
    expect(run.out.trim()).toBe("7.7.7-from-source");
  });
});

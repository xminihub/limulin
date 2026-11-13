/**
 * Homebrew packaging for the `lim` command.
 *
 * The release workflow packages each Homebrew target's binary into a
 * deterministic tarball, so the asset names it uploads are the asset names
 * `xminihub/homebrew-tap` generates its URL blocks from. Rendering the formula
 * itself lives in the tap repository (ADR-0003).
 */

import { join } from "node:path";

export const BINARY_NAME = "lim";
export const DEFAULT_TARGET = "darwin-arm64";

/** Targets `Formula/lim.rb` has a platform block for. */
export const BREW_TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
  "linux-aarch64",
] as const;

export type BrewTarget = (typeof BREW_TARGETS)[number];

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function requireVersion(version: string): string {
  if (!SEMVER.test(version)) {
    throw new Error(`not a release version: ${version}`);
  }
  return version;
}

export function parseTarget(target: string): BrewTarget {
  if (!(BREW_TARGETS as readonly string[]).includes(target)) {
    throw new Error(
      `not a homebrew target: ${target} (expected ${BREW_TARGETS.join(", ")})`,
    );
  }
  return target as BrewTarget;
}

export function assetName(version: string, target: string = DEFAULT_TARGET) {
  return `${BINARY_NAME}-${requireVersion(version)}-${parseTarget(target)}.tar.gz`;
}

const BLOCK = 512;
const text = new TextEncoder();

function octal(value: number, digits: number): string {
  return value.toString(8).padStart(digits, "0");
}

/** ustar header for one regular file, with uid/gid/mtime pinned for determinism. */
function ustarHeader(name: string, size: number): Uint8Array {
  const block = new Uint8Array(BLOCK);
  const put = (value: string, offset: number, width: number) => {
    block.set(text.encode(value).subarray(0, width), offset);
  };

  put(name, 0, 100);
  put("0000755\0", 100, 8);
  put(`${octal(0, 7)}\0`, 108, 8);
  put(`${octal(0, 7)}\0`, 116, 8);
  put(`${octal(size, 11)}\0`, 124, 12);
  put(`${octal(0, 11)}\0`, 136, 12);
  put(" ".repeat(8), 148, 8);
  put("0", 156, 1);
  put("ustar\0", 257, 6);
  put("00", 263, 2);

  let sum = 0;
  for (const byte of block) sum += byte;
  put(`${octal(sum, 6)}\0 `, 148, 8);
  return block;
}

export type PackageOptions = {
  binary: string;
  version: string;
  target?: string;
  outDir: string;
};

export type PackageResult = {
  path: string;
  asset: string;
  sha256: string;
};

export async function packageTarball({
  binary,
  version,
  target = DEFAULT_TARGET,
  outDir,
}: PackageOptions): Promise<PackageResult> {
  const payload = await Bun.file(binary).arrayBuffer();
  const bytes = new Uint8Array(payload);
  const padding = new Uint8Array((BLOCK - (bytes.byteLength % BLOCK)) % BLOCK);

  const archive = new Blob([
    ustarHeader(BINARY_NAME, bytes.byteLength),
    bytes,
    padding,
    new Uint8Array(BLOCK * 2),
  ]);
  const zipped = Bun.gzipSync(new Uint8Array(await archive.arrayBuffer()), {
    level: 9,
  });

  const asset = assetName(version, target);
  const path = join(outDir, asset);
  await Bun.write(path, zipped, { createPath: false });
  return {
    path,
    asset,
    sha256: new Bun.CryptoHasher("sha256").update(zipped).digest("hex"),
  };
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`unexpected argument: ${key}`);
    }
    flags[key.slice(2)] = value;
  }
  return flags;
}

function required(flags: Record<string, string>, name: string): string {
  const value = flags[name];
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  if (command === "package") {
    const { asset, path, sha256 } = await packageTarball({
      binary: required(flags, "binary"),
      version: required(flags, "version"),
      target: flags["target"] ?? DEFAULT_TARGET,
      outDir: required(flags, "dir"),
    });
    console.log(JSON.stringify({ asset, path, sha256 }));
    return;
  }

  throw new Error(`unknown command: ${command ?? "(none)"}`);
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}

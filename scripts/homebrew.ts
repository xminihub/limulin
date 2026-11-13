/**
 * Homebrew tap packaging for the `lim` command.
 *
 * The release workflow packages the signed darwin-arm64 binary into a tarball
 * and renders the tap formula from these helpers, so the asset the release
 * uploads and the URL the formula downloads are derived from one place.
 */

import { join } from "node:path";

export const BINARY_NAME = "lim";
export const TAP_TARGET = "darwin-arm64";
export const RELEASE_REPO = "xminihub/limulin";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;

function requireVersion(version: string): string {
  if (!SEMVER.test(version)) {
    throw new Error(`not a release version: ${version}`);
  }
  return version;
}

export function assetName(version: string): string {
  return `${BINARY_NAME}-${requireVersion(version)}-${TAP_TARGET}.tar.gz`;
}

export function downloadUrl(version: string): string {
  return `https://github.com/${RELEASE_REPO}/releases/download/v${requireVersion(
    version,
  )}/${assetName(version)}`;
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

  const asset = assetName(requireVersion(version));
  const path = join(outDir, asset);
  await Bun.write(path, zipped, { createPath: false });
  return {
    path,
    asset,
    sha256: new Bun.CryptoHasher("sha256").update(zipped).digest("hex"),
  };
}

export const TEMPLATE_PATH = join(
  import.meta.dir,
  "..",
  "packaging",
  "homebrew",
  "lim.rb.tpl",
);

export type RenderOptions = {
  version: string;
  sha256: string;
  template?: string;
};

export async function renderFormula({
  version,
  sha256,
  template = TEMPLATE_PATH,
}: RenderOptions): Promise<string> {
  if (!SHA256.test(sha256)) {
    throw new Error(`not a sha256: ${sha256}`);
  }
  requireVersion(version);
  const source = await Bun.file(template).text();
  return source
    .replaceAll("{{VERSION}}", version)
    .replaceAll("{{SHA256}}", sha256);
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
      outDir: required(flags, "dir"),
    });
    console.log(JSON.stringify({ asset, path, sha256 }));
    return;
  }

  if (command === "render") {
    const formula = await renderFormula({
      version: required(flags, "version"),
      sha256: required(flags, "sha256"),
    });
    const out = flags["out"];
    if (out) {
      await Bun.write(out, formula);
      console.log(out);
    } else {
      process.stdout.write(formula);
    }
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

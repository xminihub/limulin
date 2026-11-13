/**
 * Publish-time generation of the six npm packages (spec #4, ADR-0001):
 * the `limulin` launcher plus one `limulin-<target>` platform package
 * per target. Nothing here is committed per-package — the release
 * workflow runs this script against the built binaries, so names and
 * versions can never drift apart.
 *
 * CLI (used by CI): bun run scripts/npm-packages.ts [--binaries <dir>]
 * [--out <dir>]; defaults dist/binaries -> dist/npm.
 */

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { TARGETS, binaryAssetName } from "./targets";

export type Identity = {
  description: string;
  repository: string;
  homepage: string;
  license: string;
};

export type ManifestOptions = { version: string } & Partial<Identity>;

function identityOf(opts: Partial<Identity>): Identity {
  return { ...DEFAULT_IDENTITY, ...opts };
}

const DEFAULT_IDENTITY: Identity = {
  description: "lim — a tui for dsh and others",
  repository: "git+https://github.com/xminihub/limulin.git",
  homepage: "https://github.com/xminihub/limulin#readme",
  license: "MIT",
};

export function mainManifest(opts: ManifestOptions): Record<string, unknown> {
  const identity = identityOf(opts);
  const optionalDependencies: Record<string, string> = {};
  for (const t of TARGETS) optionalDependencies[t.pkgName] = opts.version;
  return {
    name: "limulin",
    version: opts.version,
    description: identity.description,
    license: identity.license,
    homepage: identity.homepage,
    repository: { type: "git", url: identity.repository },
    bin: { lim: "bin/lim.cjs" },
    files: ["bin/lim.cjs", "README.md"],
    optionalDependencies,
  };
}

export function platformManifests(
  opts: ManifestOptions,
): Record<string, unknown>[] {
  const identity = identityOf(opts);
  return TARGETS.map((t) => ({
    name: t.pkgName,
    version: opts.version,
    description: `lim — the limulin binary for ${t.name}`,
    license: identity.license,
    homepage: identity.homepage,
    repository: { type: "git", url: identity.repository },
    os: [t.os],
    cpu: [t.cpu],
    files: [t.binary],
  }));
}

export type WriteOptions = {
  version: string;
  /** Map of target name to the built binary path for that target. */
  binaries: Record<string, string>;
  launcherPath: string;
  outDir: string;
  identity?: Identity;
};

/** Lays down the six package directories and returns their names. */
export async function writePackages(opts: WriteOptions): Promise<string[]> {
  const identity = opts.identity ?? DEFAULT_IDENTITY;
  const version = opts.version;
  const names: string[] = [];

  const mainDir = join(opts.outDir, "limulin");
  await mkdir(join(mainDir, "bin"), { recursive: true });
  await writeFile(
    join(mainDir, "package.json"),
    `${JSON.stringify(mainManifest({ ...identity, version }), null, 2)}\n`,
  );
  await copyFile(opts.launcherPath, join(mainDir, "bin/lim.cjs"));
  names.push("limulin");

  const manifests = platformManifests({ ...identity, version });
  for (const [i, t] of TARGETS.entries()) {
    const binaryPath = opts.binaries[t.name];
    if (!binaryPath) throw new Error(`no binary for target ${t.name}`);
    const dir = join(opts.outDir, t.pkgName);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      `${JSON.stringify(manifests[i], null, 2)}\n`,
    );
    await copyFile(binaryPath, join(dir, t.binary));
    names.push(t.pkgName);
  }
  return names;
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dir, "..");
  const pkg: { version: string } = await Bun.file(
    join(root, "package.json"),
  ).json();
  const argv = process.argv.slice(2);
  const flag = (name: string, dflt: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? resolve(root, argv[i + 1] ?? dflt) : dflt;
  };
  const binariesDir = flag("binaries", join(root, "dist/binaries"));
  const outDir = flag("out", join(root, "dist/npm"));

  const binaries: Record<string, string> = {};
  for (const t of TARGETS) {
    binaries[t.name] = join(binariesDir, binaryAssetName(pkg.version, t.name));
  }
  const names = await writePackages({
    version: pkg.version,
    binaries,
    launcherPath: join(root, "bin/lim.cjs"),
    outDir,
  });
  for (const n of names) console.log(`generated ${join(outDir, n)}`);
}

if (import.meta.main) await main();

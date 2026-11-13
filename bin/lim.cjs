#!/usr/bin/env node
// lim npm launcher bin (spec #4): resolves the limulin-<os>-<cpu> platform
// package next to this file and spawns its binary with inherited stdio.
// LIM_BIN_PATH overrides resolution entirely. No matching package is a hard
// error pointing at the raw release binaries, never a silent fallback.

const { spawn } = require("child_process");
const fs = require("node:fs");
const path = require("node:path");

const PKG_PREFIX = "limulin";
const REPO = "xminihub/limulin";
const target = `${process.platform}-${process.arch}`;
const pkgName = `${PKG_PREFIX}-${target}`;
const binaryName = process.platform === "win32" ? "lim.exe" : "lim";

function fromEnvOverride() {
  const p = process.env.LIM_BIN_PATH;
  if (p === undefined || p === "") return null;
  if (!fs.existsSync(p)) {
    process.stderr.write(
      `lim: LIM_BIN_PATH points at ${p}, which does not exist.\n`,
    );
    process.exit(127);
  }
  return p;
}

function fromPlatformPackage() {
  try {
    const manifest = require.resolve(`${pkgName}/package.json`);
    const bin = path.join(path.dirname(manifest), binaryName);
    return fs.existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

const bin = fromEnvOverride() ?? fromPlatformPackage();
if (!bin) {
  process.stderr.write(
    `lim: no prebuilt binary for ${target}.\n` +
      `Download one from https://github.com/${REPO}/releases , ` +
      `or set LIM_BIN_PATH to a lim binary.\n`,
  );
  process.exit(127);
}

const child = spawn(bin, process.argv.slice(2), { stdio: "inherit" });

const forwarded =
  process.platform === "win32"
    ? ["SIGINT", "SIGTERM"]
    : ["SIGINT", "SIGTERM", "SIGHUP", "SIGUSR1"];
for (const signal of forwarded) {
  process.on(signal, () => {
    try {
      child.kill(signal);
    } catch {}
  });
}

child.on("error", (error) => {
  process.stderr.write(`lim: ${error.message}\n`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  for (const s of forwarded) process.removeAllListeners(s);
  if (signal) return process.kill(process.pid, signal);
  process.exit(typeof code === "number" ? code : 0);
});

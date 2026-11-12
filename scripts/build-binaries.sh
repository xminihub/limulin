#!/usr/bin/env bash
# Build standalone compiled binaries for all release targets.
#
# Produces dist/binaries/lim-<version>-<os>-<arch>[.exe] via
# `bun build --compile --target=...`. True cross-compilation: run this
# from any single host (CI uses ubuntu). macOS outputs are unsigned here;
# signing/notarization happens in the release workflow on macos runners.
#
# Constraints (OpenTUI 0.8.x): every target's native @opentui/core-*
# platform package must be resolvable at build time, so we install them
# with a wildcard os/cpu sweep first. Linux binaries embed both glibc and
# musl libraries (no OPENTUI_LIBC define) so one artifact serves either.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(bun -p "await Bun.file('package.json').json().then(p=>p.version)")"
CORE_RANGE="$(bun -p "await Bun.file('package.json').json().then(p=>p.dependencies['@opentui/core'])")"
OUT="dist/binaries"
mkdir -p "$OUT"

echo "==> installing all @opentui/core platform packages (wildcard os/cpu)"
# Lockfile-invisible: pulls every optional platform package onto this host.
bun install --os="*" --cpu="*" "@opentui/core@$CORE_RANGE" >/dev/null

TARGETS=(
  "bun-darwin-arm64"
  "bun-darwin-x64"
  "bun-linux-x64"
  "bun-linux-aarch64"
  "bun-windows-x64"
)

for target in "${TARGETS[@]}"; do
  name="${target#bun-}" # darwin-arm64 etc.; bun emits .exe for windows
  out="$OUT/lim-$VERSION-$name"
  [ "$name" = "windows-x64" ] && out="$out.exe"
  echo "==> compiling $out"
  bun build src/index.ts \
    --compile \
    --target="$target" \
    --define "process.env.LIMULIN_VERSION=\"$VERSION\"" \
    --outfile "$out"
done

ls -la "$OUT"
echo "done."

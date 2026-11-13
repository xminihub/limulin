#!/usr/bin/env bash
# Build standalone compiled binaries for all release targets.
#
# Produces dist/binaries/<binary asset name> (lim-<version>-<target>, .exe
# on win32) via `bun build --compile --target=...`. The target table in
# scripts/targets.ts is the single source of the vocabulary (ADR-0004).
# True cross-compilation: run this from any single host (CI uses ubuntu).
# macOS outputs are unsigned here; signing/notarization happens in the
# release workflow on macos runners.
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

# One "<bunTarget> <assetName>" line per target, straight from the table.
ROWS="$(bun -e '
  const { TARGETS, binaryAssetName } = await import("./scripts/targets.ts");
  const version = await Bun.file("package.json").json().then((p) => p.version);
  for (const t of TARGETS) console.log(t.bunTarget, binaryAssetName(version, t.name));
')"

while read -r bun_target asset; do
  [ -n "$bun_target" ] || continue
  echo "==> compiling $OUT/$asset"
  bun build src/index.ts \
    --compile \
    --target="$bun_target" \
    --define "process.env.LIMULIN_VERSION=\"$VERSION\"" \
    --outfile "$OUT/$asset"
done <<< "$ROWS"

ls -la "$OUT"
echo "done."

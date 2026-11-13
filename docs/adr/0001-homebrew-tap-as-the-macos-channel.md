# 1. Homebrew is the macOS channel; the formula is generated

Date: 2026-11-13

Status: partially superseded by ADR-0003 — the tap identity, the template and
generator location, the arm64-only platform reach and the `HOMEBREW_TAP_TOKEN`
credential are replaced. "Generated, never hand-maintained", no bottles and a
failed bump failing the release still hold.

## Context

`lim` ships as a bare Mach-O executable. For Gatekeeper to accept a downloaded
binary quietly, the usual next step after signing and notarizing is to staple the
notarization ticket to the artifact — which forced the question of whether macOS
distribution should move to a `.pkg` or `.dmg`. Issue #2 had explicitly listed
"Homebrew/scoop/apt packaging channels" as out of scope.

Meanwhile the tap repos for sibling projects (`xminihub/homebrew-oh-my-harness`,
`xminihub/homebrew-luminous`) were hand-bumped one-file formulae, and were
consistently stale.

## Decision

- Distribute macOS Apple Silicon through the tap `xminihub/limulin`, as the
  documented, recommended channel. No `.pkg`, no `.dmg`, no bottles: the formula
  downloads `lim-<version>-darwin-arm64.tar.gz` straight from GitHub Releases.
- arm64 only. Intel Macs, Linux and Windows use npm/Bun, which install the same
  `lim` command from the portable JS build.
- The formula is generated, not maintained. `packaging/homebrew/lim.rb.tpl` in
  this repository is the source of truth; the release workflow's `bump-tap` job
  renders it with the released version and the tarball's sha256 and commits to
  the tap's `main` with a scoped `HOMEBREW_TAP_TOKEN`. A bump failure fails the
  release, because a green run with a stale tap is the failure mode we are
  removing.
- Republishing a version is legal: release assets are uploaded `--clobber` and
  the formula is rewritten wholesale. Since the tarball is byte-deterministic,
  a rerun cannot leave the formula disagreeing with the asset.
- `scripts/homebrew.ts` owns asset naming, tarball layout and rendering. The
  release workflow uploads the asset name it returns, and
  `tests/homebrew.test.ts` fails if the URL spelled in the template stops
  matching the name that code derives — the two can still be written down
  twice, but they cannot silently disagree.

## Consequences

- Homebrew downloads with curl, so installed binaries carry no quarantine
  xattr and Gatekeeper never evaluates them; the tap works without stapling
  (ADR-0002).
- The tap is coupled to this repository's release workflow. Hand-editing
  `Formula/lim.rb` is futile — it is overwritten on the next release.
- Intel Macs do not get a brew path. If that becomes unacceptable, the fix is
  `on_platforms` in the template plus a darwin-x64 tarball, not a `.pkg`.
- One more secret (`HOMEBREW_TAP_TOKEN`) and one more cross-repo write in the
  release path, so a tap push failure now stops a release.

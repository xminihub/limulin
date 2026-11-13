# 4. One compiled binary per target behind every channel; npm-convention target names

Date: 2026-11-13

Status: partially supersedes the npm-channel story implied by CONTEXT.md's
"npm/Bun portable channel" wording and renames the `linux-aarch64` /
`windows-x64` targets. ADR-0002 (signing) and ADR-0003 (tap ownership) are
unaffected; ADR-0003's asset-name contract now pins `linux-arm64`.

## Context

Until now the npm package shipped a portable ESM bundle (`dist/lim.js`) that
required Node ≥ 22 or Bun and resolved OpenTUI's native renderer from
`node_modules` at runtime, while Homebrew and the releases page shipped
compiled binaries. Three artifact kinds meant three failure modes, and no
channel other than brew or npm was one line to run. opencode's model — the
compiled binary is the only artifact, npm is a CDN of per-platform packages
behind a tiny launcher, and a curl installer resolves the rest from GitHub —
was reviewed and adopted at our scale (see the distribution analysis in the
repo history). The naming was free to change while the only pinned contract
was the tap's `tools/lim.json`, which we also control.

## Decision

- Channel priority: **installer > Homebrew (macOS) > npm > raw release
  assets**. Every channel delivers the same compiled **binary**; the JS
  bundle, `engines`, `main`/`exports` and the dist-bundle tests are retired.
  Existing `limulin` npm versions ≤ 0.3.x are left undeprecated.
- The **target** vocabulary becomes the npm convention everywhere:
  `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `win32-x64`.
  Build scripts, binary and tarball asset names, the tap's brew-target keys
  and CONTEXT.md all follow. Historical release assets keep their old names.
- npm is a **launcher** (`limulin`, a dependency-free CJS bin) plus five
  **platform packages** (`limulin-<target>`), all generated at publish time
  from the single **target table**; nothing per-package is committed. A host
  with no matching platform package gets a hard error pointing at the raw
  binaries, never a silent fallback. `LIM_BIN_PATH` overrides resolution.
- The **installer** (`install.sh`, a release asset) supports macOS and Linux
  only, installs to `~/.local/bin`, edits the shell rc only when that
  directory is missing from `PATH`, resolves the current version through the
  `lim-latest.txt` asset (no GitHub API), and verifies `SHA256SUMS` before
  executing anything.
- npm publishing moves to provenance via GitHub OIDC trusted publishing,
  after macOS signing, so darwin platform packages always carry signed
  bytes. The release workflow keeps its single-workflow shape: the
  opencode-style build/publish environment split was judged disproportionate.
- Out of scope by decision, not omission: self-update/auto-update, Windows
  Authenticode, baseline and musl variants (Bun 1.4's runtime covers
  pre-AVX2 x64; one Linux artifact embeds both libc flavours), windows-arm64,
  release-time smoke tests.

## Consequences

- A bad build now breaks every channel at once — there is no JS fallback
  anywhere. The guard is the existing "every target binary was produced"
  check, not a test matrix.
- The tap cutover is ordered: the PR renaming `linux-aarch64` in the tap's
  `tools/lim.json` lands before the first release with renamed assets, or
  the tap's bump fails on the missing asset by design.
- `npm install -g limulin` requires only npm's own Node; the binary itself
  runs everywhere Bun compiled it.
- The cross-repo asset-name contract (ADR-0003) is now checked against
  names produced by the target table, making the table the one place to
  change when a target is added or renamed.

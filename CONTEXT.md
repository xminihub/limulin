# CONTEXT

Domain language for limulin. This is a glossary, not a spec: names here are the
names code, issues, tests and ADRs must use.

## Product

- **limulin** — the project and the npm package name.
- **lim** — the command users type. One binary, one command: every artifact that
  installs a program installs it as `lim`.
- **dsh session dashboard** — the intended first real feature. Until it lands,
  launching `lim` renders an empty rounded frame.

## Artifacts

- **binary** — a compiled single-file `bun build --compile` output for one
  target, named `lim-<version>-<os>-<arch>` (`.exe` on Windows). `<version>` is
  bare semver; the release _tag_ is `v<version>`.
- **target** — one of `darwin-arm64`, `darwin-x64`, `linux-x64`,
  `linux-aarch64`, `windows-x64`.
- **release asset** — a file attached to a GitHub Release. limulin publishes the
  binaries themselves plus one **tarball asset** per **brew target**.
- **tarball asset** — `lim-<version>-<target>.tar.gz`, whose only member is the
  binary renamed to `lim`, mode `0755`, uid/gid 0 and mtime at the epoch. Built
  by `scripts/homebrew.ts package --target <target>`, which pins those header
  fields so the same bytes always hash to the same sha256.
- **brew target** — the **target** subset the formula covers: `darwin-arm64`,
  `darwin-x64`, `linux-x64`, `linux-aarch64`. `windows-x64` is never a brew
  target; Homebrew has no Windows.

## Channels

- **channel** — a way to install lim: Homebrew, npm/Bun, or a standalone binary.
  Each channel owns its own users; a change to one must not silently break
  another's naming.
- **source repository** — `xminihub/limulin` on GitHub: the code, the releases,
  the binaries.
- **tap** — what Homebrew calls `xminihub/tap`, i.e. `brew tap xminihub/tap`.
  Its Git repository is _not_ the source repository: it is
  `xminihub/homebrew-tap`, the org-wide tap shared by every xminihub tool. The
  old per-project tap `xminihub/limulin` is superseded and stays untouched.
- **formula** — `Formula/lim.rb` in the tap. It is generated, never hand-edited:
  the source of truth is `tools/lim.json` plus `templates/lim.rb.tpl` in the
  tap, rendered and verified by that repository's `bump.yml`. The source
  repository only publishes the tarball assets the formula pins.

## macOS signing

- **Developer ID Application** — the signing identity. Not `Apple Development`:
  distribution binaries only.
- **hardened runtime** — `--options runtime`.
- **notarization ticket** — what `notarytool submit --wait` produces for a
  cdhash. It lives on Apple's servers.
- **stapling** — attaching that ticket to the artifact itself. Not available for
  lim: see ADR-0002.

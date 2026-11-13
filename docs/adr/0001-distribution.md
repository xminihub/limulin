# 1. Distribution: channels, targets, signing, tap contract

Date: 2026-11-13

Status: consolidates the four distribution ADRs written the same day, now
deleted. The original ADR-0001 (per-project tap as the macOS channel) and
ADR-0003 (org-wide tap) became §The tap contract; ADR-0002 (sign and notarize,
do not staple) became §Signing and notarization; ADR-0004 (binary-first,
npm-convention targets) became §Channels and priority, §Targets and artifacts,
§The npm channel and §The installer. Where an earlier ADR recorded something
that later stopped being true — arm64-only, the portable JS npm channel, brew as
_the_ recommended channel — this document says what holds today and the
superseded claim is kept under Rejected alternatives.

## Context

`lim` shipped as a bare Mach-O executable downloaded from GitHub Releases, plus
a portable ESM bundle on npm, plus a formula in a per-project tap: three
artifact kinds and three ways to be stale. Issue #2 had listed
"Homebrew/scoop/apt packaging channels" as out of scope, so the tap question
arrived late and by accident.

It arrived because of a format limit. For Gatekeeper to accept a downloaded
binary quietly, the usual step after signing and notarizing is to staple the
ticket to the artifact, and `stapler` refused with `Stapler is incapable of
working with Document files.` (exit 66) — it accepts UDIF disk images, signed
flat installer packages and code-signed executable bundles, and Apple's own
wording is that "although tickets are created for standalone binaries, it's not
currently possible to staple tickets to them". That forced the question of
whether macOS distribution should move to a `.pkg` or `.dmg`.

The signing path itself had already cost a runner lifetime: the `sign-macos`
job hung for 4h13m before being cancelled, right after printing
`lim-0.3.0-darwin-arm64: replacing existing signature`. The hang was a keychain
problem, not a codesign problem — the CI keychain was created, unlocked and
given the certificate, but the imported private key kept its ACL, so `codesign`
waited for an authorization prompt that can never appear on a headless runner.

Meanwhile the tap situation had aged badly. Sibling projects were
hand-bumped one-file formulae and consistently stale; once three tools each had
a tap, the cost was visible:

- `homebrew-limulin/Formula/` contains only a `.gitkeep` — its renderer was
  wired up on the product side, then never released far enough to be used.
- `Formula/lum.rb` still points at `vibration-autos/luminous-rs`, an org that is
  not where that project lives, and `Formula/omh.rb` and `Formula/lum.rb` have
  no `livecheck` block at all, so nothing tells a maintainer the pin is behind.
- Both pin one macOS arm64 asset while both projects also publish Linux assets,
  so Linux users of those tools have no brew path either.
- Every formula was hand-edited, and hand-edited formulae drift.
- The two projects publish `<bin>-<os>-<arch>.tar.gz` while limulin publishes
  `lim-<version>-<target>.tar.gz`. Any shared packaging machinery has to pick
  one contract.

opencode's model was reviewed and adopted at our scale: the compiled binary is
the only artifact, npm is a CDN of per-platform packages behind a tiny launcher,
and a curl installer resolves the rest from GitHub Releases. The naming was free
to change while the only pinned contract was the tap's `tools/lim.json`, which
we also control.

## Decision

### Channels and priority

- Channel priority is **installer > Homebrew > npm > raw release assets**.
  Every channel delivers the same compiled **binary**; the JS bundle, `engines`,
  `main`/`exports` and the dist-bundle tests are retired. Existing `limulin` npm
  versions ≤ 0.3.x are left undeprecated.
- Homebrew is the documented channel on macOS and Linux, and npm is the channel
  that requires no shell script. Neither is "the" recommended one: the
  installer is. Windows has no brew path and no installer; it uses npm or the
  raw `.exe`.

### Targets and artifacts

- The **target** vocabulary is the npm convention everywhere: `darwin-arm64`,
  `darwin-x64`, `linux-arm64`, `linux-x64`, `win32-x64`. `linux-aarch64` and
  `windows-x64` are retired for new releases; historical release assets keep
  their old names.
- `scripts/targets.ts` is the single **target table**. Release asset names, npm
  platform package names and Bun compile targets are all derived from it, so
  the table is the one place to change when a target is added or renamed. Each
  row yields `lim-<version>-<target>` (`.exe` on win32) and `limulin-<target>`;
  the Bun compile target is the row's own field, which keeps Bun's spelling
  (`bun-linux-aarch64`, `bun-windows-x64`) even though limulin's vocabulary no
  longer does. `tests/targets.test.ts` locks the vocabulary, and rejects
  `linux-aarch64` as a target name.
- Every Homebrew target additionally gets a tarball,
  `lim-<version>-<target>.tar.gz`, built by `scripts/homebrew.ts` with a pinned
  USTAR header — uid, gid and mtime zeroed, fixed mode, gzip level 9 — so the
  tarball is byte-deterministic for a given binary.
- **Republishing a version is legal**: release assets are uploaded `--clobber`
  and the formula is rewritten wholesale. Because the tarball is deterministic,
  a rerun cannot leave the formula disagreeing with the asset.
- Two support assets are published alongside the binaries: `SHA256SUMS`, which
  covers every binary and every brew tarball, and `lim-latest.txt`, which
  carries the bare version string.

### The npm channel

- npm is a **launcher** (`limulin`, a CJS `bin/lim.cjs` with no `dependencies`;
  the platform packages hang off it as exact-pinned `optionalDependencies`)
  plus one **platform package** per target (`limulin-<target>`), all generated
  at publish time by `scripts/npm-packages.ts` from the target table; nothing
  per-package is committed.
- A host with no matching platform package gets a hard error pointing at the
  raw binaries, never a silent fallback. `LIM_BIN_PATH` overrides resolution
  entirely.
- Publishing runs after macOS signing, so darwin platform packages always carry
  signed bytes. Token auth through `NPM_TOKEN` is what runs today, with
  `id-token: write` already declared: `--provenance` is deferred until the
  one-time npm-side trusted-publisher configuration exists for all six names.
  `limulin-win32-x64` is skipped by an explicit guard while npm's spam-detection
  403 false positive on that name stands; the other four publish normally.

### The installer

- `install.sh` ships as a release asset and supports macOS and Linux only.
- It installs to `~/.local/bin`, and edits the shell rc — `.zshrc`, `.bashrc`
  or `.profile`, by `$SHELL` — only when that directory is missing from `PATH`.
- It resolves the current version through the `lim-latest.txt` asset, not the
  GitHub API, downloads the bare `lim-<version>-<target>` binary (not the brew
  tarball) for one of the four non-win32 targets, and verifies it against
  `SHA256SUMS` before executing anything. An asset missing from `SHA256SUMS` is
  a hard failure.

### Signing and notarization

- Grant `codesign` access to the key non-interactively: `security import` with
  `-T /usr/bin/codesign -A`, then
  `security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k ci`,
  re-`unlock-keychain` immediately before signing, and pass `--keychain` to
  `codesign`.
- Keep Developer ID signing with hardened runtime (`--options runtime`; there
  is no entitlements plist), and notarize each darwin binary with
  `notarytool submit --wait` over a `ditto -c -k --keepParent` zip.
- **Do not staple.** There is nothing to staple to unless lim ships a `.pkg` or
  `.dmg`, which this document decides not to do.
- `notarytool submit --wait` returning `Accepted` is the proof that
  notarization took effect. An `spctl --assess --type exec` retry loop — a
  warning, not a failure, because Apple indexes tickets asynchronously — was
  added and later removed from the job; nothing in the signing path assesses the
  binary a second time.
- Every step in the signing path carries `timeout-minutes` (5 import, 10
  codesign, 30 notarize). A hung step must cost minutes, not a runner lifetime.

### The tap contract

- One tap for the org: `brew tap xminihub/tap`, backed by `xminihub/homebrew-tap`.
  Per-project `homebrew-*` repositories are not created any more; the existing
  ones are left alone rather than migrated.
- The tap owns the formula, the template and the generator. `tools/<name>.json`
  declares a tool's repository, binary name, class, description, homepage,
  license and brew targets; `templates/<name>.rb.tpl` holds the Ruby;
  `scripts/render.mjs` fills in `url`/`sha256` blocks per brew target. This
  replaces the earlier arrangement where `packaging/homebrew/lim.rb.tpl` in the
  source repository was the source of truth.
- The source repository owns the artifacts and nothing else. It packages one
  deterministic tarball per brew target, then dispatches the tap's `bump.yml`
  with `name`/`version` and polls that run to its conclusion. A bump that fails
  fails the release: a green run with a stale tap is the failure mode being
  removed.
- **The formula is generated, never hand-maintained.** Hand-editing
  `Formula/lim.rb` is futile, because the next bump overwrites it.
- Bumping commits straight to the tap's `main`, guarded by fetch-and-rebase
  retry so two tools releasing at once cannot lose each other's commit. The
  gates run in the same job before the push (`brew style`,
  `brew fetch --all-platforms`, `brew audit --strict --online`), which is what
  makes "a green release means an installable formula" true. Reviewing a bump
  through a pull request instead would put a human between a release and its
  formula, and the tap would be stale for however long that review takes.
- Asset naming is the cross-repo contract:
  `<bin>-<version>-<brew target>.tar.gz`, derived only inside the tap.
  `bump.yml` refuses to render when a declared target has no such asset, so a
  product that renames its artifacts breaks the bump rather than shipping a
  404 URL to users.
- Credentials are split by direction. The tap commits with its own
  `GITHUB_TOKEN`; no product token ever writes tap contents. A product only
  dispatches a run and reads it, which limulin does with a fine-grained
  `TAP_TRIGGER_TOKEN` (Actions read/write on the tap) stored as an org secret.
- Platform reach is every target except win32 — `darwin-arm64`, `darwin-x64`,
  `linux-arm64`, `linux-x64` — filtered from the target table by
  `BREW_TARGETS`, not written out as a list. `windows-x64` stays outside
  Homebrew.
- `backfill.yml` dispatches the same bump daily for any `tools/*.json` whose
  upstream latest no longer matches its formula, and files a `stale-formula`
  issue when it cannot converge. That catches the case a dropped trigger would
  otherwise leave silent.
- Sibling migration is open, not decided away: `oh-my-harness` and `luminous-rs`
  keep their own taps and their `<bin>-<os>-<arch>.tar.gz` naming until their
  migrations land. Each migration is two files in this tap plus an asset rename
  and a dispatch step in that project's release, and it retires that project's
  tap.

### Explicitly out of scope

- Out of scope by decision, not omission: self-update/auto-update, Windows
  Authenticode, baseline and musl variants (Bun 1.4's runtime covers pre-AVX2
  x64; one Linux artifact embeds both libc flavours), windows-arm64,
  release-time smoke tests.

## Consequences

- **One artifact kind, so one build breaks every channel.** There is no JS
  fallback anywhere, and the channels are published in sequence inside one run,
  so a failure partway through leaves them disagreeing rather than leaving
  nothing installed. That is the state today: GitHub Release and npm are at
  v0.4.2, `Formula/lim.rb` is still pinned at v0.3.4, and `limulin-win32-x64`
  has never existed on npm at all. The guard is the existing "every target
  binary was produced" check plus the brew-tarball non-empty check, not a test
  matrix.
- The tap-side rename has **not landed**: the tap's `tools/lim.json` still
  declares `linux-aarch64`, so it cannot render a URL block for the
  `lim-<version>-linux-arm64.tar.gz` that v0.4.2 and every later release
  publishes. Two failures sit in front of it, and only the second is the design
  working. The first was mechanical: the tap job depended only on `publish`, so
  the dispatch sent an empty `version` and the tap rejected it with HTTP 422 —
  fixed by having the job need `build` as well. The second is the contract
  doing its job: once the dispatch works, `bump.yml` refuses to render a target
  with no matching asset. The cutover is ordered deliberately — the tap PR that
  renames that key lands first, renamed releases after it — so a red bump is
  what keeps a 404 URL out of the formula, not a regression to work around.
- A tool's release pipeline and its formula can no longer be changed in one
  commit. The contract between them is an asset name, and it is checked in the
  tap rather than by a unit test in the source repository;
  `tests/homebrew.test.ts` lost its template-versus-asset case for that reason.
- A formula can be committed while upstream has already moved on, because
  `brew audit --online` judges staleness against whatever is latest at that
  moment. `backfill.yml` converges that case and files a `stale-formula` issue
  when it cannot, so staleness is visible instead of silent.
- The tap's gates need Homebrew, and `brew` is not on the PATH of GitHub's
  ubuntu runners, so `bump.yml` and `audit.yml` run on macOS runners.
  `brew fetch` therefore verifies the darwin arm64 asset on the architecture it
  can actually run; darwin-x64 and the linux assets are checksum-verified by
  the download step, not executed.
- The shipped Mach-O has no offline ticket: a quarantined direct download needs
  network for its first Gatekeeper assessment.
- The certificate import is safe-by-default on a shared runner: `-A` widens key
  access inside a keychain that is destroyed with the job.
- Two more moving parts sit in the release path — a cross-repo dispatch and an
  org secret — so a tap push failure now stops a release.
- `npm install -g limulin` requires only npm's own Node; the binary itself runs
  wherever Bun compiled it, and the win32 gap above means a Windows npm user
  currently gets the hard error rather than a binary.

## Rejected alternatives

- **`.pkg` or `.dmg` for macOS distribution.** Chosen only to make stapling
  possible, and no channel that avoids the quarantine xattr needs a ticket.
- **Stapling the notarization ticket.** Not a misconfiguration but a format
  limit: `stapler` refuses standalone binaries.
- **One tap repository per tool.** Three tools meant three taps, three sets of
  gates and three stale-formula stories for one contract.
- **The formula living in the source repository** (or being hand-bumped). Both
  left the tap to drift behind the release, which is the failure being removed.
- **A pull request between a release and its formula.** Correctness over
  freshness is the wrong trade when the gates already run before the push.
- **arm64-only macOS reach.** The fix was `on_platforms` in the template plus a
  darwin-x64 tarball, not a package format.
- **A portable JS bundle on npm.** Three artifact kinds bought three failure
  modes and a runtime dependency (Node ≥ 22 or Bun) for a tool whose binary has
  no such dependency.
- **A silent JS fallback when a platform package is missing.** A hard error that
  names the raw binaries fails visibly on an unsupported host.
- **`<bin>-<os>-<arch>.tar.gz` without the version** (the sibling convention).
  Keeping the version in the asset name makes republishing auditable and lets
  `SHA256SUMS` name the exact artifact a channel installed.
- **The single-workflow build/publish environment split** from opencode's
  pipeline. Judged disproportionate at our scale; the release workflow keeps its
  current shape.

# 3. One org-wide tap that generates and verifies its own formulae

Date: 2026-11-13

Status: partially supersedes ADR-0001 (tap identity, template and generator
location, arm64-only platform reach, `HOMEBREW_TAP_TOKEN`). ADR-0002 is
unaffected.

## Context

ADR-0001 paired each project with its own tap repository, so the org now has
`homebrew-limulin`, `homebrew-oh-my-harness` and `homebrew-luminous`, and adding a
project means adding a tap. The cost showed up as soon as there were three:

- `homebrew-limulin/Formula/` contains only a `.gitkeep`. ADR-0001's
  product-side renderer was wired up, then never released far enough to use it.
- `Formula/lum.rb` still points at `vibration-autos/luminous-rs`, an org that is
  not where the project lives; `Formula/omh.rb` and `Formula/lum.rb` have no
  `livecheck` block at all, so nothing tells a maintainer the pin is behind.
- Both pin one asset (`-macos-arm64`) while both projects also publish
  `linux-amd64` assets, so Linux users of those tools have no brew path either.
- Every formula was hand-edited, and hand-edited formulae drift.

Meanwhile the sibling projects publish `<bin>-<os>-<arch>.tar.gz`, without the
version in the asset name, while limulin publishes `lim-<version>-<target>.tar.gz`
(CONTEXT.md). Any shared packaging machinery has to pick one contract.

## Decision

- One tap for the org: `brew tap xminihub/tap`, backed by `xminihub/homebrew-tap`.
  Per-project `homebrew-*` repositories are not created any more; the existing
  ones are left alone rather than migrated in this change.
- The tap owns the formula, the template and the generator. `tools/<name>.json`
  declares a tool's repository, binary name, class, description, homepage,
  license and brew targets; `templates/<name>.rb.tpl` holds the Ruby;
  `scripts/render.mjs` fills in `url`/`sha256` blocks per brew target. This
  replaces ADR-0001's "`packaging/homebrew/lim.rb.tpl` in the source repository
  is the source of truth".
- The source repository owns the artifacts and nothing else. It packages one
  deterministic tarball asset per brew target (`scripts/homebrew.ts` keeps the
  USTAR header pinning from ADR-0001, now with `--target`), then dispatches the
  tap's `bump.yml` with `name`/`version` and polls that run to its conclusion.
  A bump that fails fails the release, which ADR-0001 already required.
- Bumping commits straight to the tap's `main`, guarded by fetch-and-rebase
  retry so two tools releasing at once cannot lose each other's commit. The
  gates run in the same job before the push (`brew style`, `brew fetch`,
  `brew audit --strict --online`), which is what makes "a green release means an
  installable formula" true. Reviewing a bump through a pull request instead
  would put a human between a release and its formula, and the tap would be
  stale for however long that review takes.
- Asset naming is the cross-repo contract: `<bin>-<version>-<target>.tar.gz`,
  derived only inside the tap. `bump.yml` refuses to render when a declared
  target has no such asset, so a product that renames its artifacts breaks the
  bump rather than shipping a 404 URL to users.
- Credentials are split by direction. The tap commits with its own
  `GITHUB_TOKEN`; no product token ever writes tap contents. A product only
  needs to dispatch and read a run, which it does with a fine-grained
  `TAP_TRIGGER_TOKEN` (Actions read/write on this tap) stored as an org secret,
  replacing ADR-0001's `HOMEBREW_TAP_TOKEN`.
- Platform reach is four brew targets: `darwin-arm64`, `darwin-x64`, `linux-x64`,
  `linux-aarch64`. `windows-x64` stays outside Homebrew, and npm/Bun remain the
  portable channels.
- `backfill.yml` dispatches the same bump daily for any `tools/*.json` whose
  upstream latest no longer matches its formula, and files a `stale-formula`
  issue when it cannot converge. That catches the case a dropped trigger would
  otherwise leave silent.

## Consequences

- A tool's release pipeline and its formula can no longer be changed in one
  commit; the contract between them is an asset name, and it is checked in the
  tap rather than in a unit test in the source repository. `tests/homebrew.test.ts`
  lost its template-versus-asset case for that reason.
- A formula can be committed while upstream has already moved on, because
  `brew audit --online` judges staleness against whatever is latest at that
  moment. `backfill.yml` is what converges that case and files a
  `stale-formula` issue when it cannot, so staleness is visible instead of
  silent.
- The tap's gates need Homebrew, and `brew` is not on the PATH of GitHub's
  ubuntu runners, so `bump.yml` and `audit.yml` run on macOS runners. That also
  means `brew fetch` verifies the darwin arm64 asset on the architecture it can
  actually run; the darwin-x64 and linux assets are checksum-verified by the
  download step, not executed.
- Formulae are generated; hand-editing `Formula/lim.rb` is still futile, now
  because the next bump overwrites it.
- `oh-my-harness` and `luminous-rs` keep their own taps and their
  `<bin>-<os>-<arch>.tar.gz` naming until their migrations land. Each migration
  is two files in this tap plus an asset rename and a dispatch step in that
  project's release, and it retires that project's tap.

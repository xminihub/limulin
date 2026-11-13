# limulin

A TUI for [dsh](https://github.com/xminihub) and others, built with [OpenTUI](https://opentui.com).

## Install

Channels are listed in order of preference; every one delivers the same
compiled binary.

**1. Installer** — macOS and Linux, one line, no Node or Bun needed:

```bash
curl -fsSL https://github.com/xminihub/limulin/releases/latest/download/install.sh | bash
```

Installs `lim` to `~/.local/bin`, verifying `SHA256SUMS` first.
Flags: `--version <x.y.z>`, `--no-modify-path`, `--binary <path>`, `--force`.

**2. Homebrew** — the recommended channel on macOS:

```bash
brew tap xminihub/tap
brew install lim
```

**3. npm** — delivers the binary through per-platform packages; works
wherever npm runs, including Windows:

```bash
npm install -g limulin   # or: bun add -g limulin
```

**4. Raw binaries** — the last resort; standalone builds for macOS, Linux
and Windows on the [releases page](https://github.com/xminihub/limulin/releases/latest),
with checksums in `SHA256SUMS`.

## Usage

```bash
lim            # launch the TUI
lim --help
```

## Development

```bash
bun install
bun run dev
bun test
```

## License

MIT

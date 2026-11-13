# limulin

A TUI for [dsh](https://github.com/xminihub) and others, built with [OpenTUI](https://opentui.com).

## Install

macOS and Linux, one line — no Node or Bun needed:

```bash
curl -fsSL https://github.com/xminihub/limulin/releases/latest/download/install.sh | bash
```

Installs `lim` to `~/.local/bin`, verifying `SHA256SUMS` first.
Flags: `--version <x.y.z>`, `--no-modify-path`, `--binary <path>`, `--force`.

On macOS, Homebrew is the recommended channel:

```bash
brew tap xminihub/tap
brew install lim
```

Or `npm install -g limulin` / `bun add -g limulin` — npm delivers the same
compiled binary through per-platform packages. Standalone binaries for
macOS, Linux and Windows are on the [releases page](https://github.com/xminihub/limulin/releases/latest).

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
